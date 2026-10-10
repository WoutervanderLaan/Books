"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, FileUp, TriangleAlert } from "lucide-react";
import { commitImportAction, previewImportAction, type CommitResponse, type PreviewResponse } from "@/app/actions/import";
import { Amount, Badge, Button, Card, CardBody, CardHeader, Field, Notice, Select, LinkButton, cn, td, th, thNum } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { NeedsMapping } from "@/lib/import/types";
import type { ImportPreview } from "@/lib/services/imports";
import { DATE_FORMATS, type CsvMapping, type DateFormat } from "@/lib/types";

type Step =
  | { kind: "idle" }
  | { kind: "error"; error: string }
  | { kind: "mapping"; mapping: NeedsMapping; draft: CsvMapping }
  | { kind: "preview"; preview: ImportPreview; mapping: CsvMapping | null }
  | { kind: "done"; result: Extract<CommitResponse, { kind: "done" }>["summary"] };

export function ImportWizard({ accountId, hasSavedMapping }: { accountId: number; hasSavedMapping: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [includePossible, setIncludePossible] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const formData = (f: File, mapping: CsvMapping | null) => {
    const fd = new FormData();
    fd.set("file", f);
    if (mapping) fd.set("mapping", JSON.stringify(mapping));
    return fd;
  };

  const runPreview = (f: File, mapping: CsvMapping | null) =>
    startTransition(async () => {
      const res: PreviewResponse = await previewImportAction(accountId, formData(f, mapping));
      if (res.kind === "error") setStep({ kind: "error", error: res.error });
      else if (res.kind === "mapping") setStep({ kind: "mapping", mapping: res.mapping, draft: res.mapping.suggestion });
      else setStep({ kind: "preview", preview: res.preview, mapping });
    });

  const commit = (mapping: CsvMapping | null) => {
    if (!file) return;
    startTransition(async () => {
      const fd = formData(file, mapping);
      if (includePossible) fd.set("includePossibleDuplicates", "on");
      const res = await commitImportAction(accountId, fd);
      if (res.kind === "error") setStep({ kind: "error", error: res.error });
      else setStep({ kind: "done", result: res.summary });
    });
  };

  const reset = () => {
    setFile(null);
    setStep({ kind: "idle" });
    setIncludePossible(false);
    if (input.current) input.current.value = "";
  };

  return (
    <Card>
      <CardHeader
        title="Import transactions"
        description="Choose the file you downloaded from your bank. You'll see a preview before anything is saved."
      />
      <CardBody className="space-y-5">
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line-strong px-6 py-8 text-center transition-colors hover:border-accent hover:bg-accent-soft/40",
            pending && "opacity-60",
          )}
        >
          <FileUp className="size-6 text-accent" aria-hidden />
          <span className="mt-2 text-sm font-medium text-ink">{file ? file.name : "Choose a bank export"}</span>
          <span className="mt-1 text-xs text-muted">.csv, .txt, .xml (CAMT.053), .sta / .940 (MT940)</span>
          <input
            ref={input}
            type="file"
            className="sr-only"
            accept=".csv,.txt,.tab,.xml,.sta,.940,.mt940,.swi"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setIncludePossible(false);
              if (f) runPreview(f, null);
            }}
          />
        </label>

        {pending ? <p className="text-sm text-ink-2">Reading file…</p> : null}

        {step.kind === "error" ? (
          <Notice tone="critical">
            <span className="font-medium text-ink">Couldn&apos;t import this file.</span> {step.error}
          </Notice>
        ) : null}

        {step.kind === "mapping" && file ? (
          <MappingForm
            mapping={step.mapping}
            draft={step.draft}
            hasSavedMapping={hasSavedMapping}
            onChange={(draft) => setStep({ ...step, draft })}
            onApply={() => runPreview(file, step.draft)}
            pending={pending}
          />
        ) : null}

        {step.kind === "preview" ? (
          <PreviewPanel
            preview={step.preview}
            includePossible={includePossible}
            setIncludePossible={setIncludePossible}
            onImport={() => commit(step.mapping)}
            onCancel={reset}
            pending={pending}
          />
        ) : null}

        {step.kind === "done" ? (
          <div className="space-y-4">
            <Notice tone="good">
              <span className="flex items-center gap-2 font-medium text-ink">
                <CheckCircle2 className="size-4 text-good" aria-hidden />
                Imported {step.result.inserted} transaction{step.result.inserted === 1 ? "" : "s"}
              </span>
              <span className="mt-1 block">
                {step.result.categorised} categorised automatically
                {step.result.duplicates ? `, ${step.result.duplicates} already present` : ""}
                {step.result.skippedPossibleDuplicates ? `, ${step.result.skippedPossibleDuplicates} likely duplicates skipped` : ""}.
              </span>
            </Notice>
            <div className="flex flex-wrap gap-2">
              {step.result.uncategorised > 0 ? (
                <LinkButton variant="primary" href={`/accounts/${accountId}/transactions?category=none`}>
                  Review {step.result.uncategorised} uncategorised
                </LinkButton>
              ) : null}
              <LinkButton href={`/accounts/${accountId}`}>Go to dashboard</LinkButton>
              <Button variant="ghost" onClick={reset}>
                Import another file
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function PreviewPanel({
  preview,
  includePossible,
  setIncludePossible,
  onImport,
  onCancel,
  pending,
}: {
  preview: ImportPreview;
  includePossible: boolean;
  setIncludePossible: (v: boolean) => void;
  onImport: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const toImport = preview.newCount + (includePossible ? preview.possibleDuplicateCount : 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="accent">{preview.formatLabel}</Badge>
        {preview.dateFrom ? (
          <span className="text-ink-2">
            {formatDate(preview.dateFrom)} – {formatDate(preview.dateTo ?? preview.dateFrom)}
          </span>
        ) : null}
        {preview.closingBalance ? (
          <span className="text-ink-2">· closing balance {formatMoney(preview.closingBalance.amount)}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="In file" value={preview.total} />
        <Stat label="New" value={preview.newCount} />
        <Stat label="Already imported" value={preview.duplicateCount} />
        <Stat label="Auto-categorised" value={preview.categorisedCount} />
      </div>
      {preview.ibanMismatch ? (
        <Notice tone="warning">
          <span className="flex items-center gap-2 font-medium text-ink">
            <TriangleAlert className="size-4" aria-hidden /> This file is for {preview.fileIbans.join(", ")}
          </span>
          That doesn&apos;t match this account&apos;s IBAN. Make sure you&apos;re importing into the right account.
        </Notice>
      ) : null}
      {preview.possibleDuplicateCount ? (
        <Notice tone="warning">
          <p>
            <span className="font-medium text-ink">{preview.possibleDuplicateCount} likely duplicates:</span> same date, amount and payee as transactions
            already stored (perhaps imported from a different file format). They&apos;re skipped unless you include them.
          </p>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={includePossible} onChange={(e) => setIncludePossible(e.target.checked)} className="accent-[var(--accent)]" />
            Import them anyway
          </label>
        </Notice>
      ) : null}
      {preview.warnings.map((w) => (
        <Notice key={w} tone="warning">
          {w}
        </Notice>
      ))}

      <div className="max-h-96 overflow-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Payee</th>
              <th className={th}>Category</th>
              <th className={th}>Status</th>
              <th className={thNum}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r, i) => (
              <tr key={i} className={r.status !== "new" ? "opacity-55" : undefined}>
                <td className={`${td} whitespace-nowrap text-ink-2`}>{formatDate(r.date)}</td>
                <td className={`${td} max-w-0`}>
                  <p className="truncate">{r.counterpartyName ?? "—"}</p>
                  <p className="truncate text-xs text-muted">{r.description}</p>
                </td>
                <td className={`${td} text-ink-2`}>{r.category ?? <span className="text-muted">—</span>}</td>
                <td className={td}>
                  {r.status === "new" ? (
                    <Badge tone="accent">New</Badge>
                  ) : r.status === "duplicate" ? (
                    <Badge>Already imported</Badge>
                  ) : (
                    <Badge tone="warning">Likely duplicate</Badge>
                  )}
                </td>
                <td className={`${td} text-right`}>
                  <Amount cents={r.amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.total > preview.rows.length ? (
        <p className="text-xs text-muted">Showing the latest {preview.rows.length} of {preview.total} rows.</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onImport} disabled={pending || toImport === 0}>
          {toImport === 0 ? "Nothing new to import" : `Import ${toImport} transaction${toImport === 1 ? "" : "s"}`}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function MappingForm({
  mapping,
  draft,
  hasSavedMapping,
  onChange,
  onApply,
  pending,
}: {
  mapping: NeedsMapping;
  draft: CsvMapping;
  hasSavedMapping: boolean;
  onChange: (m: CsvMapping) => void;
  onApply: () => void;
  pending: boolean;
}) {
  const columns = mapping.headers.map((h, i) => ({ index: i, label: draft.hasHeader ? h || `Column ${i + 1}` : `Column ${i + 1}` }));
  const sample = draft.hasHeader ? mapping.sample.slice(1) : mapping.sample;
  const set = (patch: Partial<CsvMapping>) => onChange({ ...draft, ...patch });
  const columnSelect = (label: string, value: number | undefined, update: (v: number | undefined) => void, optional = true) => (
    <Field label={label}>
      <Select value={value ?? ""} onChange={(e) => update(e.target.value === "" ? undefined : Number(e.target.value))}>
        {optional ? <option value="">— none —</option> : null}
        {columns.map((c) => (
          <option key={c.index} value={c.index}>
            {c.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <div className="space-y-4">
      <Notice tone="accent">
        This CSV layout isn&apos;t one of the built-in bank formats{hasSavedMapping ? " (and doesn't match your saved mapping)" : ""}. Tell us which column is
        which — the mapping is saved for this account, so next month&apos;s file imports in one click.
      </Notice>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.index} className="border-b border-line px-2 py-1.5 text-left font-medium whitespace-nowrap text-ink-2">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.slice(0, 5).map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.index} className="max-w-48 truncate border-b border-line px-2 py-1.5 whitespace-nowrap text-ink">
                    {row[c.index]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={draft.hasHeader} onChange={(e) => set({ hasHeader: e.target.checked })} className="accent-[var(--accent)]" />
        First row contains column names
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {columnSelect("Date", draft.date, (v) => set({ date: v ?? 0 }), false)}
        <Field label="Date format">
          <Select value={draft.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as DateFormat })}>
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Decimal separator">
          <Select value={draft.decimal} onChange={(e) => set({ decimal: e.target.value as "," | "." })}>
            <option value=",">Comma (1.234,56)</option>
            <option value=".">Point (1,234.56)</option>
          </Select>
        </Field>
        <Field label="Amount">
          <Select value={draft.amountMode} onChange={(e) => set({ amountMode: e.target.value as CsvMapping["amountMode"] })}>
            <option value="signed">Signed (minus = out)</option>
            <option value="indicator">With debit/credit column</option>
            <option value="split">Separate in/out columns</option>
          </Select>
        </Field>
        {columnSelect(draft.amountMode === "split" ? "Money in column" : "Amount column", draft.amount, (v) => set({ amount: v ?? 0 }), false)}
        {draft.amountMode === "indicator" ? (
          <>
            {columnSelect("Debit/credit column", draft.indicator, (v) => set({ indicator: v }))}
            <Field label="Values meaning money out" >
              <input
                className="h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm"
                value={draft.debitValues ?? ""}
                onChange={(e) => set({ debitValues: e.target.value })}
              />
            </Field>
          </>
        ) : null}
        {draft.amountMode === "split" ? columnSelect("Money out column", draft.debit, (v) => set({ debit: v })) : null}
        {columnSelect("Payee name", draft.counterpartyName, (v) => set({ counterpartyName: v }))}
        {columnSelect("Payee IBAN", draft.counterpartyIban, (v) => set({ counterpartyIban: v }))}
        {columnSelect("Description", draft.description[0], (v) => set({ description: v == null ? [] : [v] }))}
        {columnSelect("Balance after", draft.balance, (v) => set({ balance: v }))}
        {columnSelect("Unique id", draft.externalId, (v) => set({ externalId: v }))}
      </div>
      <Button variant="primary" onClick={onApply} disabled={pending}>
        Preview with this mapping
      </Button>
    </div>
  );
}
