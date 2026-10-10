"use client";

import { useActionState } from "react";
import { BriefcaseBusiness, Wallet } from "lucide-react";
import { createAccountAction } from "@/app/actions/accounts";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { Card, Field, Input, cn } from "@/components/ui";

export function NewAccountForm() {
  const [state, action] = useActionState(createAccountAction, null);
  return (
    <Card className="max-w-2xl p-6">
      <form action={action} className="space-y-5">
        <Field label="Name">
          <Input name="name" required placeholder="e.g. ING Betaalrekening" autoFocus />
        </Field>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Type</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <KindOption value="personal" defaultChecked icon={<Wallet className="size-4" aria-hidden />} title="Personal" text="Household spending, budget vs. actual, savings and trends." />
            <KindOption value="business" icon={<BriefcaseBusiness className="size-4" aria-hidden />} title="Business" text="Adds VAT returns, profit & loss, hours, assets and an income tax estimate." />
          </div>
        </fieldset>
        <Field label="IBAN (optional)" hint="Filled in automatically from your first import. Used to recognise transfers between your own accounts.">
          <Input name="iban" placeholder="NL00 BANK 0123 4567 89" />
        </Field>
        <Field label="Note (optional)">
          <Input name="description" placeholder="e.g. joint account" />
        </Field>
        <div className="flex items-center gap-3">
          <SubmitButton>Create account</SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>
    </Card>
  );
}

function KindOption({ value, title, text, icon, defaultChecked }: { value: string; title: string; text: string; icon: React.ReactNode; defaultChecked?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer gap-3 rounded-lg border border-line-strong p-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft")}>
      <input type="radio" name="kind" value={value} defaultChecked={defaultChecked} className="mt-1 accent-[var(--accent)]" />
      <span>
        <span className="flex items-center gap-1.5 font-medium text-ink">
          {icon}
          {title}
        </span>
        <span className="mt-1 block text-sm text-ink-2">{text}</span>
      </span>
    </label>
  );
}
