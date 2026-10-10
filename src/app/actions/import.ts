"use server";

import { isParseResult, parseStatement, type NeedsMapping } from "@/lib/import";
import { ImportError } from "@/lib/import/types";
import { bool, errorMessage } from "@/lib/form";
import { getDb } from "@/lib/server";
import { getAccount } from "@/lib/services/accounts";
import { commitImport, previewImport, undoImport, type ImportPreview, type ImportSummary } from "@/lib/services/imports";
import type { CsvMapping } from "@/lib/types";
import { refreshAll } from "./revalidate";

export type PreviewResponse =
  | { kind: "preview"; preview: ImportPreview }
  | { kind: "mapping"; mapping: NeedsMapping }
  | { kind: "error"; error: string };

export type CommitResponse = { kind: "done"; summary: ImportSummary } | { kind: "error"; error: string };

const MAX_PREVIEW_ROWS = 300;

async function readUpload(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ImportError("Choose a file first.");
  const mappingJson = fd.get("mapping");
  const mapping = typeof mappingJson === "string" && mappingJson ? (JSON.parse(mappingJson) as CsvMapping) : null;
  return { file, buffer: new Uint8Array(await file.arrayBuffer()), mapping };
}

export async function previewImportAction(accountId: number, fd: FormData): Promise<PreviewResponse> {
  try {
    const db = getDb();
    const account = getAccount(db, accountId);
    if (!account) return { kind: "error", error: "Account not found." };
    const { buffer, mapping } = await readUpload(fd);
    const outcome = parseStatement(buffer, { mapping, savedMapping: account.csvMapping });
    if (!isParseResult(outcome)) return { kind: "mapping", mapping: outcome };
    if (!outcome.transactions.length) return { kind: "error", error: "No transactions found in this file." };
    const preview = previewImport(db, accountId, outcome);
    return { kind: "preview", preview: { ...preview, rows: preview.rows.slice(-MAX_PREVIEW_ROWS).reverse() } };
  } catch (e) {
    return { kind: "error", error: errorMessage(e) };
  }
}

export async function commitImportAction(accountId: number, fd: FormData): Promise<CommitResponse> {
  try {
    const db = getDb();
    const account = getAccount(db, accountId);
    if (!account) return { kind: "error", error: "Account not found." };
    const { file, buffer, mapping } = await readUpload(fd);
    const outcome = parseStatement(buffer, { mapping, savedMapping: account.csvMapping });
    if (!isParseResult(outcome)) return { kind: "error", error: "This file needs a column mapping first." };
    const summary = commitImport(db, accountId, file.name, outcome, {
      includePossibleDuplicates: bool(fd, "includePossibleDuplicates"),
      mapping: mapping ? outcome.mapping : null,
    });
    refreshAll();
    return { kind: "done", summary };
  } catch (e) {
    return { kind: "error", error: errorMessage(e) };
  }
}

export async function undoImportAction(importId: number): Promise<void> {
  undoImport(getDb(), importId);
  refreshAll();
}
