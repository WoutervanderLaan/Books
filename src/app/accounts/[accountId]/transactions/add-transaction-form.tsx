"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { addManualTransactionAction } from "@/app/actions/transactions";
import { CategoryOptions } from "@/components/category-options";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { Button, Field, Input, Select } from "@/components/ui";
import type { Category } from "@/lib/db/schema";
import { todayIso } from "@/lib/dates";
import { VAT_CODES, VAT_CODE_LABELS } from "@/lib/types";

/** Dialog for transactions that aren't in a bank file: cash, mileage, invoices paid privately. */
export function AddTransactionForm({ accountId, business, categories }: { accountId: number; business: boolean; categories: Category[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(addManualTransactionAction.bind(null, accountId), null);

  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <>
      <Button size="sm" onClick={() => dialog.current?.showModal()}>
        <Plus className="size-3.5" aria-hidden /> Add manually
      </Button>
      <dialog
        ref={dialog}
        className="m-auto w-full max-w-lg rounded-xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40"
      >
        <form ref={form} action={action} className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold">Add a transaction</h2>
            <p className="mt-1 text-sm text-ink-2">
              For things that aren&apos;t in your bank export, like cash payments{business ? ", business kilometres or a business expense paid privately" : ""}.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Input type="date" name="date" required defaultValue={todayIso()} />
            </Field>
            <Field label="Amount (€)">
              <div className="flex gap-2">
                <Select name="direction" defaultValue="out" className="w-28">
                  <option value="out">Out</option>
                  <option value="in">In</option>
                </Select>
                <Input name="amount" inputMode="decimal" required placeholder="0,00" />
              </div>
            </Field>
            <Field label="Payee / source">
              <Input name="counterpartyName" />
            </Field>
            <Field label="Category">
              <Select name="categoryId" defaultValue="">
                <option value="">— Uncategorised —</option>
                <CategoryOptions categories={categories} />
              </Select>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Input name="description" placeholder={business ? "e.g. 312 km × €0,23 client visits" : ""} />
            </Field>
            {business ? (
              <Field label="VAT">
                <Select name="vatCode" defaultValue="">
                  <option value="">Use category default</option>
                  {VAT_CODES.map((c) => (
                    <option key={c} value={c}>
                      {VAT_CODE_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            <FormMessage state={state} />
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
                Close
              </Button>
              <SubmitButton>Add</SubmitButton>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
