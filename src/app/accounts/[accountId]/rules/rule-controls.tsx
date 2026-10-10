"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { reapplyRulesAction, saveRuleAction, toggleRuleAction } from "@/app/actions/rules";
import { CategoryOptions } from "@/components/category-options";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { Button, Field, Input, Select } from "@/components/ui";
import type { Category, Rule } from "@/lib/db/schema";
import { VAT_CODES, VAT_CODE_LABELS } from "@/lib/types";

const euros = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export function RuleForm({ accountId, categories, business, rule }: { accountId: number; categories: Category[]; business: boolean; rule?: Rule }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(saveRuleAction.bind(null, accountId, rule?.id ?? null), null);
  useEffect(() => {
    if (state?.ok && rule) dialog.current?.close();
  }, [state, rule]);

  return (
    <>
      {rule ? (
        <Button size="sm" variant="ghost" onClick={() => dialog.current?.showModal()}>
          Edit
        </Button>
      ) : (
        <Button size="sm" variant="primary" onClick={() => dialog.current?.showModal()}>
          <Plus className="size-3.5" aria-hidden /> New rule
        </Button>
      )}
      <dialog ref={dialog} className="m-auto w-full max-w-xl rounded-xl border border-line bg-surface p-0 text-left text-ink shadow-xl backdrop:bg-black/40">
        <form action={action} className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold">{rule ? "Edit rule" : "New rule"}</h2>
            <p className="mt-1 text-sm text-ink-2">All conditions you fill in must match. Text matches whole words, e.g. “albert heijn”.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Counterparty contains">
              <Input name="counterpartyContains" defaultValue={rule?.counterpartyContains ?? ""} placeholder="albert heijn" />
            </Field>
            <Field label="Description contains">
              <Input name="descriptionContains" defaultValue={rule?.descriptionContains ?? ""} placeholder="spotify" />
            </Field>
            <Field label="Counterparty IBAN is">
              <Input name="counterpartyIban" defaultValue={rule?.counterpartyIban ?? ""} placeholder="NL.." />
            </Field>
            <Field label="Direction">
              <Select name="direction" defaultValue={rule?.direction ?? ""}>
                <option value="">In or out</option>
                <option value="out">Money out</option>
                <option value="in">Money in</option>
              </Select>
            </Field>
            <Field label="Amount at least (€)">
              <Input name="amountMin" inputMode="decimal" defaultValue={euros(rule?.amountMin ?? null)} />
            </Field>
            <Field label="Amount at most (€)">
              <Input name="amountMax" inputMode="decimal" defaultValue={euros(rule?.amountMax ?? null)} />
            </Field>
            <Field label="Then categorise as" className="sm:col-span-2">
              <Select name="categoryId" required defaultValue={rule?.categoryId ?? ""}>
                <option value="">— Choose —</option>
                <CategoryOptions categories={categories} />
              </Select>
            </Field>
            {business ? (
              <Field label="and set VAT to">
                <Select name="vatCode" defaultValue={rule?.vatCode ?? ""}>
                  <option value="">Category default</option>
                  {VAT_CODES.map((c) => (
                    <option key={c} value={c}>
                      {VAT_CODE_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Applies to">
              <Select name="scope" defaultValue={rule && !rule.accountId ? "all" : "account"}>
                <option value="account">This account</option>
                <option value="all">All accounts</option>
              </Select>
            </Field>
            <Field label="Priority" hint="Higher wins when several rules match">
              <Input name="priority" type="number" defaultValue={rule?.priority ?? 0} />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3">
            <FormMessage state={state} />
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
                Close
              </Button>
              <SubmitButton>Save rule</SubmitButton>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function RuleToggle({ id, enabled }: { id: number; enabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      aria-label="Rule enabled"
      checked={enabled}
      disabled={pending}
      onChange={(e) => start(() => toggleRuleAction(id, e.target.checked))}
      className="accent-[var(--accent)]"
    />
  );
}

export function ReapplyButtons({ accountId }: { accountId: number }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const run = (overwrite: boolean) =>
    start(async () => {
      const res = await reapplyRulesAction(accountId, overwrite);
      setMessage(res.ok ? res.message ?? null : res.error);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {message ? <span className="text-sm text-ink-2">{message}</span> : null}
      <Button size="sm" disabled={pending} onClick={() => run(false)} title="Only transactions without a category">
        Apply to uncategorised
      </Button>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Re-run all rules on every transaction that wasn't categorised by hand?")) run(true);
        }}
      >
        Re-run all rules
      </Button>
    </div>
  );
}
