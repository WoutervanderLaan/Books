"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Plus } from "lucide-react";
import { archiveCategoryAction, saveCategoryAction } from "@/app/actions/categories";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { Button, Field, Input, Select } from "@/components/ui";
import type { Category } from "@/lib/db/schema";
import { TAX_GROUPS, TAX_GROUP_LABELS, VAT_CODES, VAT_CODE_LABELS } from "@/lib/types";

export function CategoryForm({ category }: { category?: Category }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(saveCategoryAction.bind(null, category?.id ?? null), null);
  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);
  return (
    <>
      {category ? (
        <Button size="sm" variant="ghost" onClick={() => dialog.current?.showModal()}>
          Edit
        </Button>
      ) : (
        <Button variant="primary" onClick={() => dialog.current?.showModal()}>
          <Plus className="size-4" aria-hidden /> New category
        </Button>
      )}
      <dialog ref={dialog} className="m-auto w-full max-w-xl rounded-xl border border-line bg-surface p-0 text-left text-ink shadow-xl backdrop:bg-black/40">
        <form action={action} className="space-y-4 p-6">
          <h2 className="text-base font-semibold">{category ? "Edit category" : "New category"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input name="name" required defaultValue={category?.name} />
            </Field>
            <Field label="Group" hint="Categories are grouped in reports">
              <Input name="groupName" required defaultValue={category?.groupName} placeholder="e.g. Housing" />
            </Field>
            <Field label="Type">
              <Select name="kind" defaultValue={category?.kind ?? "expense"}>
                <option value="expense">Spending</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer (left out of totals)</option>
              </Select>
            </Field>
            <Field label="Used for">
              <Select name="scope" defaultValue={category?.scope ?? "personal"}>
                <option value="personal">Personal accounts</option>
                <option value="business">Business accounts</option>
                <option value="both">Both</option>
              </Select>
            </Field>
            <Field label="Special role" hint="Leave empty for normal categories">
              <Select name="role" defaultValue={category?.role ?? ""}>
                <option value="">None</option>
                <option value="internal_transfer">Transfer between own accounts</option>
                <option value="savings">Savings / investments</option>
                <option value="private">Private ↔ business transfer</option>
                <option value="vat">VAT payment / refund</option>
                <option value="income_tax">Income tax payment</option>
                <option value="asset">Asset purchase (depreciated)</option>
              </Select>
            </Field>
            <div />
            <Field label="Default VAT (business)">
              <Select name="vatCode" defaultValue={category?.vatCode ?? ""}>
                <option value="">—</option>
                {VAT_CODES.map((c) => (
                  <option key={c} value={c}>
                    {VAT_CODE_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Profit & loss section (business)">
              <Select name="taxGroup" defaultValue={category?.taxGroup ?? ""}>
                <option value="">—</option>
                {TAX_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {TAX_GROUP_LABELS[g]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deductible for income tax (%)" hint="E.g. 80 for meals and representation">
              <Input name="deductiblePct" type="number" min={0} max={100} defaultValue={category?.deductiblePct ?? 100} />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3">
            <FormMessage state={state} />
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
                Cancel
              </Button>
              <SubmitButton>Save</SubmitButton>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function ArchiveToggle({ id, archived }: { id: number; archived: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => archiveCategoryAction(id, !archived))}>
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}
