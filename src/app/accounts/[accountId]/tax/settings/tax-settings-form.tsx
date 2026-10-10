"use client";

import { useActionState } from "react";
import { updateTaxYearAction } from "@/app/actions/tax";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { Card, CardBody, CardHeader, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import type { TaxYear } from "@/lib/db/schema";
import type { ParamUnit } from "@/lib/tax/params";

interface FieldValue {
  path: string;
  label: string;
  unit: ParamUnit;
  value: number;
  builtIn: number;
}

const display = (v: number, unit: ParamUnit) => (unit === "pct" ? +(v * 100).toFixed(4) : v);
const euros = (c: number) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");

export function TaxSettingsForm({
  accountId,
  year,
  taxYear,
  fields,
  status,
  note,
}: {
  accountId: number;
  year: number;
  taxYear: TaxYear;
  fields: FieldValue[];
  status: "confirmed" | "provisional";
  note: string | null;
}) {
  const [state, action] = useActionState(updateTaxYearAction.bind(null, accountId, year), null);
  return (
    <form action={action} className="space-y-6">
      <Card>
        <CardHeader title={`Your situation in ${year}`} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-start gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" name="isStarter" defaultChecked={taxYear.isStarter} className="mt-1" />
            <span>
              I qualify for the starter deduction (startersaftrek)
              <span className="block text-xs text-muted">Max. 3 times in the first 5 years as an entrepreneur.</span>
            </span>
          </label>
          <Field label="Hours criterion" hint="“Automatic” uses the hours you logged">
            <Select name="hoursCriterion" defaultValue={taxYear.hoursCriterion}>
              <option value="auto">Automatic</option>
              <option value="yes">Met</option>
              <option value="no">Not met</option>
            </Select>
          </Field>
          <Field label="Other box 1 income (€)" hint="E.g. salary from employment, for the tax brackets">
            <Input name="otherIncome" inputMode="decimal" defaultValue={euros(taxYear.otherIncome)} />
          </Field>
          <Field label="Income tax already paid elsewhere (€)" hint="Provisional assessments paid from another account">
            <Input name="prepaidTax" inputMode="decimal" defaultValue={euros(taxYear.prepaidTax)} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea name="notes" defaultValue={taxYear.notes ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Tax parameters ${year}`}
          description="Pre-filled with the built-in values. Change a value if the official figure differs; only changed values are stored."
        />
        <CardBody className="space-y-4">
          <Notice tone={status === "provisional" ? "warning" : "neutral"}>
            {status === "provisional" ? `Provisional values. ${note ?? ""}` : "Built-in values based on published rates for this year."} Always check
            the current figures on belastingdienst.nl.
          </Notice>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => {
              const changed = Math.abs(f.value - f.builtIn) > 1e-9;
              return (
                <Field
                  key={f.path}
                  label={`${f.label}${f.unit === "pct" ? " (%)" : f.unit === "eur" ? " (€)" : ""}`}
                  hint={changed ? `Built-in: ${display(f.builtIn, f.unit)}` : undefined}
                >
                  <Input name={`param:${f.path}`} inputMode="decimal" defaultValue={display(f.value, f.unit)} className={changed ? "border-accent" : undefined} />
                </Field>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <SubmitButton>Save tax settings</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
