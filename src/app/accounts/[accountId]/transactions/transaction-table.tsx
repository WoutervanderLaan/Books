"use client";

import { Fragment, useActionState, useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Sparkles, User, ArrowLeftRight } from "lucide-react";
import { deleteTransactionAction, setCategoryAction, updateTransactionAction } from "@/app/actions/transactions";
import { CategoryOptions } from "@/components/category-options";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { Amount, Button, Field, Input, Select, cn, td, th, thNum } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { TransactionRow } from "@/lib/services/transactions";
import { splitVat } from "@/lib/tax/vat";
import { formatIban } from "@/lib/text";
import { VAT_CODES, VAT_CODE_LABELS, type CategoryKind, type VatCode } from "@/lib/types";
import { kindFitsAmount } from "@/lib/rules/engine";

interface CategoryChoice {
  id: number;
  name: string;
  groupName: string;
  kind: CategoryKind;
  vatCode: VatCode | null;
}

const REMEMBER_KEY = "books.rememberCategory";

export function TransactionTable({
  rows,
  categories,
  business,
}: {
  rows: TransactionRow[];
  categories: CategoryChoice[];
  business: boolean;
  accountId: number;
}) {
  const [remember, setRemember] = useState(true);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(REMEMBER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync a per-browser preference once
      if (stored != null) setRemember(stored === "1");
    } catch {
      /* storage unavailable: keep default */
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const changeCategory = (id: number, value: string) => {
    startTransition(async () => {
      const result = await setCategoryAction(id, value ? Number(value) : null, remember);
      if (!result.ok) setToast({ text: result.error, error: true });
      else if (result.message) setToast({ text: result.message });
    });
  };

  if (!rows.length) {
    return <p className="px-5 py-10 text-center text-sm text-muted">No transactions match these filters.</p>;
  }

  return (
    <div className={cn(pending && "opacity-70 transition-opacity")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => {
              setRemember(e.target.checked);
              try {
                window.localStorage.setItem(REMEMBER_KEY, e.target.checked ? "1" : "0");
              } catch {
                /* ignore */
              }
            }}
            className="accent-[var(--accent)]"
          />
          Remember my choice for this payee (creates a rule)
        </label>
        <span className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1"><Sparkles className="size-3" aria-hidden /> by rule</span>
          <span className="flex items-center gap-1"><ArrowLeftRight className="size-3" aria-hidden /> own transfer</span>
          <span className="flex items-center gap-1"><User className="size-3" aria-hidden /> by you</span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(th, "w-8")}>
                <span className="sr-only">Details</span>
              </th>
              <th className={cn(th, "w-28")}>Date</th>
              <th className={th}>Payee & description</th>
              <th className={cn(th, "w-60")}>Category</th>
              {business ? <th className={cn(thNum, "w-24")}>VAT</th> : null}
              <th className={cn(thNum, "w-32")}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tx) => {
              const vatCode = tx.vatCode ?? tx.categoryVatCode ?? "none";
              const gross = tx.categoryKind === "income" ? tx.amount : -tx.amount;
              const vat = business && tx.categoryKind && tx.categoryKind !== "transfer" ? splitVat(gross, vatCode, { vatHigh: 21, vatLow: 9 }, tx.vatAmount).vat : 0;
              const isOpen = open === tx.id;
              return (
                <Fragment key={tx.id}>
                  <tr className={cn(!tx.categoryId && "bg-surface-2/60")}>
                    <td className={cn(td, "pr-0")}>
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : tx.id)}
                        className="rounded p-0.5 text-muted hover:bg-surface-3 hover:text-ink"
                        aria-expanded={isOpen}
                        aria-label="Show details"
                      >
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-ink-2")}>{formatDate(tx.date)}</td>
                    <td className={cn(td, "max-w-0")}>
                      <p className="truncate font-medium text-ink">{tx.counterpartyName || tx.txType || "—"}</p>
                      <p className="truncate text-xs text-muted" title={tx.description}>
                        {tx.description || tx.txType || ""}
                        {tx.note ? <span className="text-ink-2"> · {tx.note}</span> : null}
                      </p>
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-1.5">
                        <SourceIcon source={tx.categorySource} />
                        <Select
                          aria-label={`Category for ${tx.counterpartyName ?? "transaction"}`}
                          className={cn("h-8 text-[13px]", !tx.categoryId && "border-warning")}
                          value={tx.categoryId ?? ""}
                          onChange={(e) => changeCategory(tx.id, e.target.value)}
                        >
                          <option value="">— Uncategorised —</option>
                          <CategoryOptions categories={categories} amount={tx.amount} />
                        </Select>
                      </div>
                      {tx.categoryKind && !kindFitsAmount(tx.categoryKind, tx.amount) ? (
                        <p className="mt-0.5 pl-5 text-[11px] text-muted">{tx.amount >= 0 ? "Refund — lowers spending" : "Paid back — lowers income"}</p>
                      ) : null}
                    </td>
                    {business ? (
                      <td className={cn(td, "text-right text-xs whitespace-nowrap text-ink-2 tabular")}>
                        {vat ? formatMoney(vat) : <span className="text-muted">{tx.categoryKind === "transfer" ? "" : VAT_CODE_LABELS[vatCode]}</span>}
                      </td>
                    ) : null}
                    <td className={cn(td, "text-right")}>
                      <Amount cents={tx.amount} />
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr>
                      <td colSpan={business ? 6 : 5} className="border-b border-line bg-surface-2/50 px-5 py-4">
                        <Details tx={tx} business={business} onDone={() => setOpen(null)} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {toast ? (
        <div
          role="status"
          className={cn(
            "fixed right-4 bottom-4 z-50 max-w-md rounded-lg border bg-surface px-4 py-3 text-sm shadow-lg",
            toast.error ? "border-critical text-critical-text" : "border-line text-ink",
          )}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

function SourceIcon({ source }: { source: TransactionRow["categorySource"] }) {
  if (source === "rule") return <Sparkles className="size-3.5 shrink-0 text-muted" aria-label="Categorised by a rule" />;
  if (source === "transfer") return <ArrowLeftRight className="size-3.5 shrink-0 text-muted" aria-label="Transfer between your accounts" />;
  if (source === "manual") return <User className="size-3.5 shrink-0 text-muted" aria-label="Categorised by you" />;
  return <span className="inline-block size-3.5 shrink-0" />;
}

function Details({ tx, business, onDone }: { tx: TransactionRow; business: boolean; onDone: () => void }) {
  const [state, action] = useActionState(updateTransactionAction.bind(null, tx.id), null);
  const [deleting, startDelete] = useTransition();
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted">Counterparty</dt>
        <dd className="text-ink">{tx.counterpartyName ?? "—"}</dd>
        <dt className="text-muted">IBAN</dt>
        <dd className="text-ink">{tx.counterpartyIban ? formatIban(tx.counterpartyIban) : "—"}</dd>
        <dt className="text-muted">Type</dt>
        <dd className="text-ink">{tx.txType ?? "—"}</dd>
        <dt className="text-muted">Description</dt>
        <dd className="break-words text-ink">{tx.description || "—"}</dd>
        {tx.balanceAfter != null ? (
          <>
            <dt className="text-muted">Balance after</dt>
            <dd className="text-ink tabular">{formatMoney(tx.balanceAfter)}</dd>
          </>
        ) : null}
        <dt className="text-muted">Source</dt>
        <dd className="text-ink">{tx.isManual ? "Added by hand" : "Bank import"}</dd>
      </dl>
      <form action={action} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Note">
            <Input name="note" defaultValue={tx.note ?? ""} placeholder="e.g. invoice 2025-014" />
          </Field>
          {business ? (
            <>
              <Field label="VAT" hint={`Category default: ${VAT_CODE_LABELS[tx.categoryVatCode ?? "none"]}`}>
                <Select name="vatCode" defaultValue={tx.vatCode ?? ""}>
                  <option value="">Use category default</option>
                  {VAT_CODES.map((c) => (
                    <option key={c} value={c}>
                      {VAT_CODE_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Exact VAT amount (optional)" hint="From the invoice, when it differs from the calculated amount">
                <Input name="vatAmount" inputMode="decimal" defaultValue={tx.vatAmount != null ? (tx.vatAmount / 100).toFixed(2) : ""} />
              </Field>
              <Field label="Invoice date (optional)" hint="Use when the VAT/tax period differs from the payment date">
                <Input type="date" name="taxDate" defaultValue={tx.taxDate ?? ""} />
              </Field>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton size="sm">Save details</SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Close
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={deleting}
            onClick={() => {
              if (window.confirm("Delete this transaction? Re-importing the same file would add it again.")) {
                startDelete(async () => {
                  await deleteTransactionAction(tx.id);
                });
              }
            }}
          >
            Delete
          </Button>
          <FormMessage state={state} />
        </div>
      </form>
    </div>
  );
}
