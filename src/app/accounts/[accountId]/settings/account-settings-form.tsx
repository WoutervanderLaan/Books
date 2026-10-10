"use client";

import { useActionState, useState } from "react";
import { updateAccountAction } from "@/app/actions/accounts";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import type { Account } from "@/lib/db/schema";

export function AccountSettingsForm({ account }: { account: Account }) {
  const [state, action] = useActionState(updateAccountAction.bind(null, account.id), null);
  const [auto, setAuto] = useState(account.autoBalance);
  return (
    <Card>
      <CardHeader title="Account details" />
      <CardBody>
        <form action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input name="name" required defaultValue={account.name} />
            </Field>
            <Field label="IBAN" hint="Used to recognise transfers between your own accounts">
              <Input name="iban" defaultValue={account.iban ?? ""} />
            </Field>
            <Field label="Note" className="sm:col-span-2">
              <Input name="description" defaultValue={account.description ?? ""} />
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-ink-2">Balance</legend>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" name="autoBalance" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-1" />
              <span>
                Keep the balance in sync with my bank statements
                <span className="block text-xs text-muted">Uses the balance in the imported file (most formats include it).</span>
              </span>
            </label>
            {!auto ? (
              <Field label="Opening balance (€)" hint="Balance before the oldest imported transaction" className="max-w-xs">
                <Input name="openingBalance" inputMode="decimal" defaultValue={(account.openingBalance / 100).toFixed(2).replace(".", ",")} />
              </Field>
            ) : null}
          </fieldset>
          {account.kind === "business" ? (
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" name="vatKor" defaultChecked={account.vatKor} className="mt-1" />
              <span>
                I use the small business scheme (KOR)
                <span className="block text-xs text-muted">No VAT is charged or reclaimed; costs count including VAT.</span>
              </span>
            </label>
          ) : null}
          <div className="flex items-center gap-3">
            <SubmitButton>Save</SubmitButton>
            <FormMessage state={state} />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
