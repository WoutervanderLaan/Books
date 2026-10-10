import Link from "next/link";
import { Card, CardBody, CardHeader, Meter, Notice, StatTile, Table, td, tdNum } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { YearSelect } from "@/components/year-select";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { getDb, requireAccount } from "@/lib/server";
import { taxOverview } from "@/lib/services/tax";
import { yearFromParams, yearOptions } from "@/lib/tax/year";
import { TAX_GROUP_LABELS } from "@/lib/types";

export const metadata = { title: "Profit & income tax" };

export default async function TaxOverviewPage({ params, searchParams }: PageProps<"/accounts/[accountId]/tax">) {
  const { accountId } = await params;
  const year = yearFromParams(await searchParams);
  const account = requireAccount(accountId);
  const o = taxOverview(getDb(), account, year);
  const e = o.estimate;
  const base = `/accounts/${account.id}`;
  const q = `?year=${year}`;

  const step = (label: React.ReactNode, amount: number, opts: { strong?: boolean; sub?: React.ReactNode; sign?: "-" | "+" } = {}) => (
    <tr className={opts.strong ? "font-semibold" : undefined}>
      <td className={td}>
        {label}
        {opts.sub ? <span className="block text-xs font-normal text-muted">{opts.sub}</span> : null}
      </td>
      <td className={tdNum}>
        {opts.sign === "-" && amount ? "− " : opts.sign === "+" && amount ? "+ " : ""}
        {formatMoney(Math.abs(amount))}
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <YearSelect years={yearOptions(o.availableYears, year)} value={year} />
        <PrintButton label="Print summary for tax return" />
      </div>

      {o.params.status === "provisional" ? (
        <Notice tone="warning">
          Tax parameters for {year} are provisional{o.params.note ? `: ${o.params.note}` : "."}{" "}
          <Link className="font-medium text-accent hover:underline" href={`${base}/tax/settings${q}`}>
            Review them
          </Link>
        </Notice>
      ) : null}
      {o.pnl.uncategorised.count ? (
        <Notice tone="warning">
          {o.pnl.uncategorised.count} transactions in {year} have no category and are left out of the figures below.{" "}
          <Link className="font-medium text-accent hover:underline" href={`${base}/transactions?category=none&from=${year}-01-01&to=${year}-12-31`}>
            Categorise them
          </Link>
        </Notice>
      ) : null}

      {o.partialYear ? (
        <p className="text-sm text-ink-2">
          {year} is still running: figures are based on transactions so far. Expect the estimate to grow as the year progresses.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Revenue (excl. VAT)" value={formatMoney(o.pnl.totalIncome, { whole: true })} />
        <StatTile label="Costs incl. depreciation" value={formatMoney(o.pnl.totalCosts + o.pnl.depreciation, { whole: true })} />
        <StatTile label="Profit" value={formatMoney(o.pnl.profit, { whole: true })} />
        <StatTile
          label="Income tax + Zvw (estimate)"
          value={formatMoney(e.total, { whole: true })}
          hint={e.effectiveRate != null ? `≈ ${formatPercent(e.effectiveRate)} of profit` : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Profit & loss ${year}`} description="Amounts exclude VAT you can reclaim. Grouped like the income tax return." />
          <Table>
            <tbody>
              {o.pnl.income.map((g) => (
                <GroupRows key={g.group} label={TAX_GROUP_LABELS[g.group]} total={g.total} lines={g.lines.map((l) => ({ name: l.name, amount: l.amount }))} />
              ))}
              <tr className="font-semibold">
                <td className={td}>Total income</td>
                <td className={tdNum}>{formatMoney(o.pnl.totalIncome)}</td>
              </tr>
              {o.pnl.costs.map((g) => (
                <GroupRows
                  key={g.group}
                  label={TAX_GROUP_LABELS[g.group]}
                  total={g.total}
                  lines={g.lines.map((l) => ({ name: l.amount !== l.deductible ? `${l.name} (deductible part)` : l.name, amount: l.deductible }))}
                />
              ))}
              {o.pnl.depreciation ? (
                <tr>
                  <td className={td}>
                    Depreciation (afschrijvingen){" "}
                    <Link href={`${base}/tax/assets${q}`} className="text-xs text-accent hover:underline">
                      assets
                    </Link>
                  </td>
                  <td className={tdNum}>{formatMoney(o.pnl.depreciation)}</td>
                </tr>
              ) : null}
              <tr className="font-semibold">
                <td className={td}>Total costs</td>
                <td className={tdNum}>{formatMoney(o.pnl.totalCosts + o.pnl.depreciation)}</td>
              </tr>
              <tr className="font-semibold">
                <td className={td}>Profit</td>
                <td className={tdNum}>{formatMoney(o.pnl.profit)}</td>
              </tr>
              {o.pnl.nonDeductible ? (
                <tr>
                  <td className={`${td} text-ink-2`} colSpan={2}>
                    {formatMoney(o.pnl.nonDeductible)} of costs is not deductible (e.g. 20% of meals & representation) and left out.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Hours criterion" description={`At least ${formatNumber(o.params.urencriterium, 0)} hours for the entrepreneur deductions`} />
            <CardBody className="space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-ink-2">
                  {formatNumber(o.hours)} of {formatNumber(o.params.urencriterium, 0)} hours logged
                </span>
                <span className={o.hoursCriterionMet ? "font-medium text-good-text" : "font-medium text-warning-text"}>
                  {o.taxYear.hoursCriterion === "yes"
                    ? "✓ Met (set by you)"
                    : o.taxYear.hoursCriterion === "no"
                      ? "Not met (set by you)"
                      : o.hours >= o.params.urencriterium
                        ? "✓ Met"
                        : o.hoursCriterionMet
                          ? `On track (≈ ${formatNumber(o.hoursProjected ?? 0, 0)} h this year)`
                          : o.partialYear
                            ? "Behind schedule"
                            : "Not met"}
                </span>
              </div>
              <Meter value={o.hours} max={o.params.urencriterium} label="Hours criterion progress" kind="goal" />
              <Link className="text-sm text-accent hover:underline" href={`${base}/tax/hours${q}`}>
                Log hours
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Income tax estimate" description="Indicative: box 1 below state pension age, no other deductions. Check with the Belastingdienst." />
            <Table>
              <tbody>
                {step("Profit", e.profit)}
                {e.kia ? step("Small-scale investment deduction (KIA)", e.kia, { sign: "-" }) : null}
                {step("Self-employed deduction (zelfstandigenaftrek)", e.zelfstandigenaftrek, {
                  sign: "-",
                  sub: o.hoursCriterionMet ? undefined : "Requires the hours criterion",
                })}
                {o.taxYear.isStarter ? step("Starter deduction (startersaftrek)", e.startersaftrek, { sign: "-" }) : null}
                {step(`SME profit exemption (${formatPercent(o.params.mkbWinstvrijstelling, 2)})`, e.mkbVrijstelling, { sign: "-" })}
                {step("Taxable profit", e.taxableProfit, { strong: true })}
                {e.otherIncome ? step("Other box 1 income (e.g. salary)", e.otherIncome, { sign: "+" }) : null}
                {step("Box 1 tax before credits", e.box1Gross)}
                {step("General tax credit", e.generalCredit, { sign: "-" })}
                {step("Labour tax credit", e.labourCredit, { sign: "-" })}
                {e.otherIncome ? step("Less: tax on your other income alone", e.box1TaxWithoutBusiness, { sign: "-", sub: "Usually withheld by your employer" }) : null}
                {step("Income tax due to the business", e.businessIncomeTax, { strong: true })}
                {step(`Zvw contribution (${formatPercent(o.params.zvwRate, 2)})`, e.zvw, { sign: "+" })}
                {step("Total estimate", e.total, { strong: true })}
                {step("Already paid (provisional assessments)", o.incomeTaxPaid, { sign: "-" })}
                <tr className="font-semibold">
                  <td className={td}>{o.incomeTaxRemaining >= 0 ? "Still to pay" : "Expected refund"}</td>
                  <td className={tdNum}>{formatMoney(Math.abs(o.incomeTaxRemaining))}</td>
                </tr>
              </tbody>
            </Table>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Money flows outside profit" description="Useful for the return and for your own overview" />
          <Table>
            <tbody>
              <tr>
                <td className={td}>VAT paid to / (received from) the tax office</td>
                <td className={tdNum}>{formatMoney(o.vatPaid)}</td>
              </tr>
              <tr>
                <td className={td}>Income tax & Zvw paid from this account</td>
                <td className={tdNum}>{formatMoney(o.incomeTaxPaid - o.taxYear.prepaidTax)}</td>
              </tr>
              <tr>
                <td className={td}>Private withdrawals (privé-opnamen)</td>
                <td className={tdNum}>{formatMoney(o.privateWithdrawals)}</td>
              </tr>
              <tr>
                <td className={td}>Private deposits (privé-stortingen)</td>
                <td className={tdNum}>{formatMoney(o.privateDeposits)}</td>
              </tr>
              <tr>
                <td className={td}>Investments eligible for KIA</td>
                <td className={tdNum}>{formatMoney(o.kiaBase)}</td>
              </tr>
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Checklist for your tax return" />
          <CardBody>
            <ul className="space-y-2 text-sm text-ink-2">
              <li>• All {year} transactions categorised{o.pnl.uncategorised.count ? ` — ${o.pnl.uncategorised.count} left` : " ✓"}</li>
              <li>• Hours criterion documented ({formatNumber(o.hours)} h logged)</li>
              <li>• Assets bought this year added for depreciation and KIA</li>
              <li>• Business costs paid privately (e.g. business kilometres at {formatMoney(Math.round(o.params.kmAllowance * 100))}/km) added as manual transactions</li>
              <li>• Q4 VAT return filed before 31 January</li>
              <li>• Personal items for the return: pension contributions (lijfrente), box 3 assets, mortgage, fiscal partner</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function GroupRows({ label, total, lines }: { label: string; total: number; lines: { name: string; amount: number }[] }) {
  return (
    <>
      <tr>
        <td className="border-b border-line bg-surface-2 px-5 py-1.5 text-xs font-semibold text-ink-2">{label}</td>
        <td className="border-b border-line bg-surface-2 px-5 py-1.5 text-right text-xs font-semibold text-ink-2 tabular">{formatMoney(total)}</td>
      </tr>
      {lines.map((l) => (
        <tr key={l.name}>
          <td className={`${td} pl-8 text-ink-2`}>{l.name}</td>
          <td className={`${tdNum} text-ink-2`}>{formatMoney(l.amount)}</td>
        </tr>
      ))}
    </>
  );
}

