"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { FileSpreadsheet } from "lucide-react";
import { importBudgetLinesAction, readSpreadsheetAction, type Sheet } from "@/app/actions/budget";
import { CategoryOptions } from "@/components/category-options";
import { Button, Field, Notice, Select, td, th, thNum } from "@/components/ui";
import { matchCategory, parseBudgetType, parseFrequency } from "@/lib/budget/match";
import type { Category } from "@/lib/db/schema";
import { formatMoney } from "@/lib/format";
import { parseAmount } from "@/lib/import/util";
import type { BudgetFrequency, BudgetType } from "@/lib/types";

interface Draft {
  include: boolean;
  name: string;
  amount: number;
  frequency: BudgetFrequency;
  type: BudgetType;
  categoryId: number | null;
}

const tryAmount = (s: string | undefined): number | null => {
  if (!s || !/\d/.test(s)) return null;
  try {
    return parseAmount(s);
  } catch {
    return null;
  }
};

function guessColumns(rows: string[][]) {
  const width = Math.max(...rows.map((r) => r.length));
  const body = rows.slice(1, 40);
  let amount = -1;
  let name = -1;
  for (let i = 0; i < width; i++) {
    const values = body.map((r) => r[i] ?? "").filter((v) => v.trim());
    if (!values.length) continue;
    const numeric = values.filter((v) => tryAmount(v) != null).length / values.length;
    if (amount < 0 && numeric > 0.6) amount = i;
    if (name < 0 && numeric < 0.3) name = i;
  }
  const header = rows[0]?.map((h) => h.toLowerCase()) ?? [];
  const find = (re: RegExp) => header.findIndex((h) => re.test(h));
  return {
    name: Math.max(0, find(/omschrijving|naam|post|item|name|description/) >= 0 ? find(/omschrijving|naam|post|item|name|description/) : name),
    amount: find(/bedrag|amount|kosten|per maand|maand/) >= 0 ? find(/bedrag|amount|kosten|per maand|maand/) : Math.max(0, amount),
    category: find(/categorie|category|groep|group|soort/),
    frequency: find(/frequentie|frequency|periode|period|per$/),
    type: find(/^type$|vast|variabel|fixed/),
    hasHeader: header.some((h) => /[a-z]{3,}/.test(h)) && tryAmount(rows[0]?.[Math.max(0, amount)]) == null,
  };
}

/** Imports budget lines from an Excel (.xlsx) or CSV overview. */
export function SpreadsheetImport({ accountId, categories }: { accountId: number; categories: Category[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [cols, setCols] = useState<ReturnType<typeof guessColumns> | null>(null);
  const [defaults, setDefaults] = useState<{ frequency: BudgetFrequency; type: BudgetType }>({ frequency: "monthly", type: "fixed" });
  const [overrides, setOverrides] = useState<Record<number, Partial<Draft>>>({});
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = useMemo(() => sheets?.[sheetIndex]?.rows ?? [], [sheets, sheetIndex]);
  const width = Math.max(0, ...rows.map((r) => r.length));
  const header = cols?.hasHeader ? rows[0] : undefined;
  const colLabel = (i: number) => (header?.[i] ? `${header[i]} (col ${i + 1})` : `Column ${i + 1}`);

  const drafts: Draft[] = useMemo(() => {
    if (!cols) return [];
    return (cols.hasHeader ? rows.slice(1) : rows).flatMap((r, i) => {
      const name = (r[cols.name] ?? "").trim();
      const amount = tryAmount(r[cols.amount]);
      if (!name || amount == null || amount === 0) return [];
      const category = cols.category >= 0 ? matchCategory(r[cols.category] ?? "", categories) : null;
      const base: Draft = {
        // Totals rows are part of most budget sheets but aren't budget lines.
        include: !/^(sub)?(totaal|total|som|sum)\b/i.test(name),
        name,
        amount: Math.abs(amount),
        frequency: (cols.frequency >= 0 ? parseFrequency(r[cols.frequency]) : null) ?? defaults.frequency,
        type: (cols.type >= 0 ? parseBudgetType(r[cols.type]) : null) ?? defaults.type,
        categoryId: category?.id ?? matchCategory(name, categories)?.id ?? null,
      };
      return [{ ...base, ...overrides[i], _row: i } as Draft & { _row: number }];
    });
  }, [cols, rows, categories, defaults, overrides]);

  const load = (file: File) => {
    setMessage(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await readSpreadsheetAction(fd);
      if (!res.ok) {
        setMessage({ text: res.error, error: true });
        return;
      }
      setSheets(res.sheets);
      setSheetIndex(0);
      setOverrides({});
      setCols(guessColumns(res.sheets[0].rows));
    });
  };

  const selected = drafts.filter((d) => d.include);
  const doImport = () =>
    startTransition(async () => {
      const res = await importBudgetLinesAction(
        accountId,
        selected.map(({ name, amount, frequency, type, categoryId }) => ({ name, amount, frequency, type, categoryId })),
      );
      if (res.ok) {
        setMessage({ text: res.message ?? "Imported." });
        setSheets(null);
        setCols(null);
      } else setMessage({ text: res.error, error: true });
    });

  const columnSelect = (label: string, value: number, onChange: (v: number) => void, optional: boolean) => (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {optional ? <option value={-1}>— none —</option> : null}
        {Array.from({ length: width }, (_, i) => (
          <option key={i} value={i}>
            {colLabel(i)}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <>
      <Button size="sm" onClick={() => dialog.current?.showModal()}>
        <FileSpreadsheet className="size-3.5" aria-hidden /> Import from Excel
      </Button>
      <dialog ref={dialog} className="m-auto w-full max-w-4xl rounded-xl border border-line bg-surface p-0 text-left text-ink shadow-xl backdrop:bg-black/40">
        <div className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold">Import budget from a spreadsheet</h2>
            <p className="mt-1 text-sm text-ink-2">
              Pick your Excel (.xlsx) or CSV overview, point out the name and amount columns, and check the categories. Nothing is saved until you
              click import.
            </p>
          </div>
          <input
            type="file"
            accept=".xlsx,.csv,.txt"
            onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
            className="block text-sm file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
          />
          {message ? <Notice tone={message.error ? "critical" : "good"}>{message.text}</Notice> : null}
          {sheets && cols ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {sheets.length > 1 ? (
                  <Field label="Sheet">
                    <Select
                      value={sheetIndex}
                      onChange={(e) => {
                        const i = Number(e.target.value);
                        setSheetIndex(i);
                        setOverrides({});
                        setCols(guessColumns(sheets[i].rows));
                      }}
                    >
                      {sheets.map((s, i) => (
                        <option key={s.name} value={i}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                {columnSelect("Name column", cols.name, (v) => setCols({ ...cols, name: v }), false)}
                {columnSelect("Amount column", cols.amount, (v) => setCols({ ...cols, amount: v }), false)}
                {columnSelect("Category column", cols.category, (v) => setCols({ ...cols, category: v }), true)}
                {columnSelect("Frequency column", cols.frequency, (v) => setCols({ ...cols, frequency: v }), true)}
                <Field label="Default frequency">
                  <Select value={defaults.frequency} onChange={(e) => setDefaults({ ...defaults, frequency: e.target.value as BudgetFrequency })}>
                    <option value="monthly">Per month</option>
                    <option value="quarterly">Per quarter</option>
                    <option value="yearly">Per year</option>
                  </Select>
                </Field>
                <Field label="Default type">
                  <Select value={defaults.type} onChange={(e) => setDefaults({ ...defaults, type: e.target.value as BudgetType })}>
                    <option value="fixed">Fixed</option>
                    <option value="variable">Estimate</option>
                  </Select>
                </Field>
                <label className="flex items-end gap-2 pb-2 text-sm text-ink-2">
                  <input type="checkbox" checked={cols.hasHeader} onChange={(e) => setCols({ ...cols, hasHeader: e.target.checked })} />
                  First row is a header
                </label>
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border border-line">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr>
                      <th className={th}>
                        <span className="sr-only">Include</span>
                      </th>
                      <th className={th}>Name</th>
                      <th className={thNum}>Amount</th>
                      <th className={th}>Per</th>
                      <th className={th}>Type</th>
                      <th className={th}>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d) => {
                      const row = (d as Draft & { _row: number })._row;
                      const set = (patch: Partial<Draft>) => setOverrides({ ...overrides, [row]: { ...overrides[row], ...patch } });
                      return (
                        <tr key={row} className={d.include ? undefined : "opacity-50"}>
                          <td className={td}>
                            <input type="checkbox" checked={d.include} onChange={(e) => set({ include: e.target.checked })} aria-label={`Include ${d.name}`} />
                          </td>
                          <td className={td}>{d.name}</td>
                          <td className={`${td} text-right tabular`}>{formatMoney(d.amount)}</td>
                          <td className={td}>
                            <Select className="h-8 w-28 text-[13px]" value={d.frequency} onChange={(e) => set({ frequency: e.target.value as BudgetFrequency })}>
                              <option value="monthly">Month</option>
                              <option value="quarterly">Quarter</option>
                              <option value="yearly">Year</option>
                            </Select>
                          </td>
                          <td className={td}>
                            <Select className="h-8 w-28 text-[13px]" value={d.type} onChange={(e) => set({ type: e.target.value as BudgetType })}>
                              <option value="fixed">Fixed</option>
                              <option value="variable">Estimate</option>
                            </Select>
                          </td>
                          <td className={td}>
                            <Select
                              className="h-8 text-[13px]"
                              value={d.categoryId ?? ""}
                              onChange={(e) => set({ categoryId: e.target.value ? Number(e.target.value) : null })}
                            >
                              <option value="">— Choose —</option>
                              <CategoryOptions categories={categories} />
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => dialog.current?.close()}>
              Close
            </Button>
            {sheets ? (
              <Button variant="primary" disabled={pending || !selected.length} onClick={doImport}>
                Import {selected.length} line{selected.length === 1 ? "" : "s"}
              </Button>
            ) : null}
          </div>
        </div>
      </dialog>
    </>
  );
}
