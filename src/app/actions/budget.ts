"use server";

import ExcelJS from "exceljs";
import { readCsvRows } from "@/lib/import";
import { decodeBuffer } from "@/lib/import/util";
import { errorMessage, isMonth, oneOf, optInt, optMoney, optStr, str, type ActionResult } from "@/lib/form";
import { getDb } from "@/lib/server";
import { deleteBudgetLine, importBudgetLines, saveBudgetLine, type BudgetLineInput } from "@/lib/services/budget";
import { BUDGET_FREQUENCIES, BUDGET_TYPES } from "@/lib/types";
import { refreshAll } from "./revalidate";

export async function saveBudgetLineAction(accountId: number, lineId: number | null, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const name = str(fd, "name");
  const amount = optMoney(fd, "amount");
  if (!name) return { ok: false, error: "Give the line a name." };
  if (amount == null) return { ok: false, error: "Enter an amount." };
  const startMonth = str(fd, "startMonth");
  const endMonth = str(fd, "endMonth");
  if ((startMonth && !isMonth(startMonth)) || (endMonth && !isMonth(endMonth))) {
    return { ok: false, error: "Months must look like 2025-01." };
  }
  saveBudgetLine(
    getDb(),
    accountId,
    {
      name,
      amount,
      categoryId: optInt(fd, "categoryId"),
      frequency: oneOf(str(fd, "frequency"), BUDGET_FREQUENCIES, "monthly"),
      type: oneOf(str(fd, "type"), BUDGET_TYPES, "fixed"),
      startMonth: startMonth || null,
      endMonth: endMonth || null,
      note: optStr(fd, "note"),
    },
    lineId ?? undefined,
  );
  refreshAll();
  return { ok: true, message: lineId ? "Line updated." : "Line added." };
}

export async function deleteBudgetLineAction(lineId: number): Promise<void> {
  deleteBudgetLine(getDb(), lineId);
  refreshAll();
}

export interface Sheet {
  name: string;
  rows: string[][];
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value && value.result != null) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String(value.text);
    if ("error" in value) return "";
    return "";
  }
  return String(value);
}

/** Reads an .xlsx or .csv budget overview into plain rows. */
export async function readSpreadsheetAction(fd: FormData): Promise<{ ok: true; sheets: Sheet[] } | { ok: false; error: string }> {
  try {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file first." };
    const buffer = Buffer.from(await file.arrayBuffer());
    if (/\.csv$|\.txt$/i.test(file.name)) {
      const { rows } = readCsvRows(decodeBuffer(new Uint8Array(buffer)));
      return { ok: true, sheets: [{ name: file.name, rows: rows.slice(0, 500) }] };
    }
    if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: "Use an .xlsx or .csv file (save .xls/.numbers as .xlsx first)." };
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheets: Sheet[] = [];
    workbook.eachSheet((ws) => {
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const values = row.values as ExcelJS.CellValue[];
        const cells = values.slice(1).map(cellText);
        if (cells.some((c) => c.trim())) rows.push(cells);
      });
      if (rows.length) sheets.push({ name: ws.name, rows: rows.slice(0, 500) });
    });
    if (!sheets.length) return { ok: false, error: "The workbook has no data." };
    return { ok: true, sheets };
  } catch (e) {
    return { ok: false, error: `Could not read the file: ${errorMessage(e)}` };
  }
}

export async function importBudgetLinesAction(accountId: number, lines: BudgetLineInput[]): Promise<ActionResult> {
  const clean = lines
    .filter((l) => l.name?.trim() && Number.isFinite(l.amount) && l.amount !== 0)
    .map((l) => ({
      name: l.name.trim().slice(0, 200),
      amount: Math.round(Math.abs(l.amount)),
      categoryId: l.categoryId ?? null,
      frequency: oneOf(l.frequency, BUDGET_FREQUENCIES, "monthly"),
      type: oneOf(l.type, BUDGET_TYPES, "fixed"),
    }));
  const n = importBudgetLines(getDb(), accountId, clean);
  refreshAll();
  return { ok: true, message: `${n} budget line${n === 1 ? "" : "s"} imported.` };
}
