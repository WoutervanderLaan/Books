import { YearSelect } from "@/components/year-select";
import { getDb, requireAccount } from "@/lib/server";
import { taxOverview } from "@/lib/services/tax";
import { builtInParams, getPath, paramFields } from "@/lib/tax/params";
import { yearFromParams, yearOptions } from "@/lib/tax/year";
import { TaxSettingsForm } from "./tax-settings-form";

export const metadata = { title: "Tax settings" };

export default async function TaxSettingsPage({ params, searchParams }: PageProps<"/accounts/[accountId]/tax/settings">) {
  const { accountId } = await params;
  const year = yearFromParams(await searchParams);
  const account = requireAccount(accountId);
  const o = taxOverview(getDb(), account, year);
  const builtIn = builtInParams(year);
  const fields = paramFields(o.params).map((f) => ({
    ...f,
    value: getPath(o.params, f.path),
    builtIn: getPath(builtIn, f.path),
  }));

  return (
    <div className="space-y-6">
      <YearSelect years={yearOptions(o.availableYears, year)} value={year} />
      <TaxSettingsForm
        key={year}
        accountId={account.id}
        year={year}
        taxYear={o.taxYear}
        fields={fields}
        status={o.params.status}
        note={o.params.note ?? null}
      />
    </div>
  );
}
