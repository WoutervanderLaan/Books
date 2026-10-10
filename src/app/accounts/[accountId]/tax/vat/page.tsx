import { Card, CardHeader, Notice, Table, td, tdNum, th, thNum } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { YearSelect } from "@/components/year-select";
import { formatDate, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { getDb, requireAccount } from "@/lib/server";
import { taxOverview } from "@/lib/services/tax";
import { vatDeadline, yearFromParams, yearOptions } from "@/lib/tax/year";

export const metadata = { title: "VAT returns" };

export default async function VatPage({ params, searchParams }: PageProps<"/accounts/[accountId]/tax/vat">) {
  const { accountId } = await params;
  const year = yearFromParams(await searchParams);
  const account = requireAccount(accountId);
  const o = taxOverview(getDb(), account, year);
  const today = todayIso();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <YearSelect years={yearOptions(o.availableYears, year)} value={year} />
        <PrintButton />
      </div>
      {account.vatKor ? (
        <Notice tone="accent">
          This account uses the small business scheme (KOR): you don&apos;t charge VAT and don&apos;t file VAT returns. Costs count including VAT.
          Change this in the account settings.
        </Notice>
      ) : (
        <>
          <Notice>
            Figures follow the boxes (rubrieken) of the Dutch VAT return. They are based on payment dates unless you set an invoice date on a
            transaction. VAT is calculated from each category&apos;s default rate unless you set a different rate or exact amount on the transaction.
          </Notice>
          <div className="grid gap-6 lg:grid-cols-2">
            {o.vat.map((r) => {
              const deadline = vatDeadline(year, r.quarter);
              const due = deadline < today;
              return (
                <Card key={r.quarter}>
                  <CardHeader
                    title={`Q${r.quarter} ${year}`}
                    description={`${r.transactionCount} transactions · file and pay by ${formatDate(deadline)}${due ? " (passed)" : ""}`}
                  />
                  <Table>
                    <thead>
                      <tr>
                        <th className={th}>Box</th>
                        <th className={thNum}>Amount</th>
                        <th className={thNum}>VAT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.boxes.map((b) => (
                        <tr key={b.code} className={b.base === 0 && b.vat === 0 ? "text-muted" : undefined}>
                          <td className={td}>
                            <span className="mr-2 inline-block w-6 font-semibold">{b.code}</span>
                            <span className="text-ink-2">{b.label}</span>
                          </td>
                          <td className={tdNum}>{b.code === "5b" ? "" : formatMoney(b.base)}</td>
                          <td className={tdNum}>{formatMoney(b.vat)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className={td}>
                          <span className="mr-2 inline-block w-6">5g</span>
                          {r.balance >= 0 ? "To pay" : "To reclaim"}
                        </td>
                        <td className={tdNum} />
                        <td className={tdNum}>{formatMoney(Math.abs(r.balance))}</td>
                      </tr>
                      {r.uncategorised ? (
                        <tr>
                          <td className={`${td} text-warning-text`} colSpan={3}>
                            {r.uncategorised} uncategorised transactions are not included.
                          </td>
                        </tr>
                      ) : null}
                      {r.notReported ? (
                        <tr>
                          <td className={`${td} text-ink-2`} colSpan={3}>
                            {formatMoney(r.notReported)} revenue outside the EU or VAT-exempt is not part of this return.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </Table>
                </Card>
              );
            })}
          </div>
          <p className="text-sm text-ink-2">
            VAT actually paid to the tax office in {year} (category “VAT payments & refunds”): <span className="font-semibold text-ink">{formatMoney(o.vatPaid)}</span>
          </p>
        </>
      )}
    </div>
  );
}
