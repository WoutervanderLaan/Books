"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { saveBudgetLineAction } from "@/app/actions/budget";
import { CategoryOptions } from "@/components/category-options";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { Button, Field, Input, Select } from "@/components/ui";
import type { BudgetLine, Category } from "@/lib/db/schema";

export function BudgetLineForm({ accountId, categories, line }: { accountId: number; categories: Category[]; line?: BudgetLine }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(saveBudgetLineAction.bind(null, accountId, line?.id ?? null), null);

  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);

  return (
    <>
      {line ? (
        <Button size="sm" variant="ghost" onClick={() => dialog.current?.showModal()}>
          Edit
        </Button>
      ) : (
        <Button size="sm" variant="primary" onClick={() => dialog.current?.showModal()}>
          <Plus className="size-3.5" aria-hidden /> Add line
        </Button>
      )}
      <dialog ref={dialog} className="m-auto w-full max-w-lg rounded-xl border border-line bg-surface p-0 text-left text-ink shadow-xl backdrop:bg-black/40">
        <form action={action} className="space-y-4 p-6">
          <h2 className="text-base font-semibold">{line ? "Edit budget line" : "Add budget line"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">
              <Input name="name" required defaultValue={line?.name} placeholder="e.g. Rent, Netflix, Groceries" />
            </Field>
            <Field label="Category" hint="Compared with actual spending in this category" className="sm:col-span-2">
              <Select name="categoryId" defaultValue={line?.categoryId ?? ""}>
                <option value="">— Choose —</option>
                <CategoryOptions categories={categories} />
              </Select>
            </Field>
            <Field label="Amount (€)">
              <Input name="amount" inputMode="decimal" required defaultValue={line ? (line.amount / 100).toFixed(2).replace(".", ",") : ""} />
            </Field>
            <Field label="Per">
              <Select name="frequency" defaultValue={line?.frequency ?? "monthly"}>
                <option value="monthly">Month</option>
                <option value="quarterly">Quarter</option>
                <option value="yearly">Year</option>
              </Select>
            </Field>
            <Field label="Type">
              <Select name="type" defaultValue={line?.type ?? "fixed"}>
                <option value="fixed">Fixed amount</option>
                <option value="variable">Estimate (varies)</option>
              </Select>
            </Field>
            <div />
            <Field label="From month (optional)" hint="e.g. 2025-01">
              <Input name="startMonth" type="month" defaultValue={line?.startMonth ?? ""} />
            </Field>
            <Field label="Until month (optional)">
              <Input name="endMonth" type="month" defaultValue={line?.endMonth ?? ""} />
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
