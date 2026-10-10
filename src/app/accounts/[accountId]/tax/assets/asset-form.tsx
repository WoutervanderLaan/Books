"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { saveAssetAction } from "@/app/actions/tax";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { Button, Field, Input } from "@/components/ui";
import type { Asset } from "@/lib/db/schema";

const euros = (c: number | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export function AssetForm({ accountId, asset }: { accountId: number; asset?: Asset }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(saveAssetAction.bind(null, accountId, asset?.id ?? null), null);
  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);
  return (
    <>
      {asset ? (
        <Button size="sm" variant="ghost" onClick={() => dialog.current?.showModal()}>
          Edit
        </Button>
      ) : (
        <Button size="sm" variant="primary" onClick={() => dialog.current?.showModal()}>
          <Plus className="size-3.5" aria-hidden /> Add asset
        </Button>
      )}
      <dialog ref={dialog} className="m-auto w-full max-w-lg rounded-xl border border-line bg-surface p-0 text-left text-ink shadow-xl backdrop:bg-black/40">
        <form action={action} className="space-y-4 p-6">
          <h2 className="text-base font-semibold">{asset ? "Edit asset" : "Add asset"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">
              <Input name="name" required defaultValue={asset?.name} placeholder="MacBook Pro" />
            </Field>
            <Field label="Purchase date">
              <Input type="date" name="purchaseDate" required defaultValue={asset?.purchaseDate} />
            </Field>
            <Field label="Price excl. VAT (€)">
              <Input name="cost" inputMode="decimal" required defaultValue={euros(asset?.cost)} />
            </Field>
            <Field label="Useful life (years)" hint="Typically 3–5 for computers, 5–10 for furniture">
              <Input name="usefulLifeYears" type="number" min={1} max={50} defaultValue={asset?.usefulLifeYears ?? 5} />
            </Field>
            <Field label="Residual value (€)">
              <Input name="residualValue" inputMode="decimal" defaultValue={euros(asset?.residualValue ?? 0)} />
            </Field>
            <Field label="Sold / disposed on (optional)">
              <Input type="date" name="disposedDate" defaultValue={asset?.disposedDate ?? ""} />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm text-ink-2">
              <input type="checkbox" name="kiaEligible" defaultChecked={asset?.kiaEligible ?? true} />
              Counts for KIA
            </label>
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
