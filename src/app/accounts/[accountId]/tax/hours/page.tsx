import { Card, CardBody, CardHeader, Meter, Table, td, tdNum, th, thNum } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { deleteHoursAction } from "@/app/actions/tax";
import { YearSelect } from "@/components/year-select";
import { formatDate, formatMonth, monthOf, todayIso } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { getDb, requireAccount } from "@/lib/server";
import { listHours, taxOverview } from "@/lib/services/tax";
import { yearFromParams, yearOptions } from "@/lib/tax/year";
import { HoursForm } from "./hours-form";

export const metadata = { title: "Hours" };

export default async function HoursPage({ params, searchParams }: PageProps<"/accounts/[accountId]/tax/hours">) {
  const { accountId } = await params;
  const year = yearFromParams(await searchParams);
  const account = requireAccount(accountId);
  const db = getDb();
  const o = taxOverview(db, account, year);
  const entries = listHours(db, account.id, year);
  const target = o.params.urencriterium;

  const byMonth = new Map<string, number>();
  for (const e of entries) byMonth.set(monthOf(e.date), (byMonth.get(monthOf(e.date)) ?? 0) + e.hours);

  // Pace: hours needed per remaining week to reach the criterion.
  const today = todayIso();
  const endOfYear = `${year}-12-31`;
  const weeksLeft = today > endOfYear ? 0 : Math.max(1, Math.ceil((Date.parse(endOfYear) - Date.parse(today > `${year}-01-01` ? today : `${year}-01-01`)) / (7 * 86_400_000)));
  const remaining = Math.max(0, target - o.hours);

  return (
    <div className="space-y-6">
      <YearSelect years={yearOptions(o.availableYears, year)} value={year} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={`Hours criterion ${year}`} description="Time spent on your business, including acquisition, admin and travel — not just billable hours." />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-2xl font-semibold text-ink">
                  {formatNumber(o.hours)} <span className="text-base font-normal text-ink-2">/ {formatNumber(target, 0)} hours</span>
                </p>
                <p className="text-sm text-ink-2">
                  {remaining === 0
                    ? "Criterion met ✓"
                    : weeksLeft
                      ? `${formatNumber(remaining)} h to go · ≈ ${formatNumber(remaining / weeksLeft)} h/week for the rest of the year`
                      : `${formatNumber(remaining)} h short`}
                </p>
              </div>
              <Meter value={o.hours} max={target} label="Hours criterion progress" kind="goal" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Logged hours" />
            {entries.length ? (
              <Table>
                <thead>
                  <tr>
                    <th className={th}>Date</th>
                    <th className={th}>Description</th>
                    <th className={thNum}>Hours</th>
                    <th className={th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...entries].reverse().map((e) => (
                    <tr key={e.id}>
                      <td className={`${td} whitespace-nowrap text-ink-2`}>{formatDate(e.date)}</td>
                      <td className={td}>{e.description ?? ""}</td>
                      <td className={tdNum}>{formatNumber(e.hours, 2)}</td>
                      <td className={`${td} text-right`}>
                        <ConfirmButton action={deleteHoursAction.bind(null, e.id)} confirm="Delete this entry?" variant="ghost">
                          Delete
                        </ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="px-5 pb-5 text-sm text-muted">No hours logged for {year}. Log per day, per week or per month — whatever you can document.</p>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Log hours" />
            <CardBody>
              <HoursForm accountId={account.id} defaultDate={today.startsWith(String(year)) ? today : `${year}-12-31`} />
            </CardBody>
          </Card>
          {byMonth.size ? (
            <Card>
              <CardHeader title="Per month" />
              <Table>
                <tbody>
                  {[...byMonth.entries()].map(([m, h]) => (
                    <tr key={m}>
                      <td className={td}>{formatMonth(m)}</td>
                      <td className={tdNum}>{formatNumber(h)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
