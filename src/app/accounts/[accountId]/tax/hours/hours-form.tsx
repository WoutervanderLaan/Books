"use client";

import { useActionState, useEffect, useRef } from "react";
import { addHoursAction } from "@/app/actions/tax";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { Field, Input } from "@/components/ui";

export function HoursForm({ accountId, defaultDate }: { accountId: number; defaultDate: string }) {
  const [state, action] = useActionState(addHoursAction.bind(null, accountId), null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.querySelector<HTMLInputElement>("input[name=hours]")?.focus();
  }, [state]);
  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" name="date" required defaultValue={defaultDate} />
        </Field>
        <Field label="Hours">
          <Input name="hours" inputMode="decimal" required placeholder="8" />
        </Field>
      </div>
      <Field label="Description (optional)">
        <Input name="description" placeholder="Client work, acquisition, admin…" />
      </Field>
      <div className="flex items-center gap-3">
        <SubmitButton>Add</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
