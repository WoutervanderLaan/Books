import { YearOverlayChart } from "@/components/charts";
import { Badge, Card, CardBody, CardHeader, EmptyState, Notice, Table, td, tdNum, th, thNum } from "@/components/ui";
import { catMap, flowOf, monthsBetween } from "@/lib/analytics";
import { formatDate, formatMonth, monthOf } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/format";
import { getDb, requireAccount } from "@/lib/server";
import { allCategories } from "@/lib/services/accounts";
import { trendsData } from "@/lib/services/dashboard";
import { allTransactions } from "@/lib/services/transactions";
import { CategoryExplorer } from "./category-explorer";

export const metadata = { title: "Trends" };

function Change({ current, previous, invert = true }: { current: number; previous: number; invert?: boolean }) {
  if (!previous) return <span className="text-muted">new</span>;
  const pct = (current - previous) / previous;
  if (Math.abs(pct) < 0.005) return <span className="text-muted">±0%</span>;
  const good = invert ? pct < 0 : pct > 0;
  return (
    <span className={good ? "text-good-text" : "text-critical-text"}>
      {pct > 0 ? "▲" : "▼"} {formatPercent(Math.abs(pct))}
    </span>
  );
}

export default async function TrendsPage({ params }: PageProps<"/accounts/[accountId]/trends">) {
  const { accountId } = await params;
  const account = requireAccount(accountId);
  const db = getDb();
  const data = trendsData(db, account);
  if (!data.range) return <EmptyState title="No data yet">Import transactions to see how your spending develops over time.</EmptyState>;

  const { years, rows } = data.byYear;
  const lastYears = years.slice(-4);
  const yearTotals = lastYears.map((y) => rows.reduce((s, r) => s + (r.byYear[y] ?? 0), 0));
  const sorted = [...rows].sort((a, b) => (b.byYear[lastYears[lastYears.length - 1]] ?? 0) - (a.byYear[lastYears[lastYears.length - 1]] ?? 0));
  const changes = data.changes.filter((c) => c.current > 0 || c.previous > 0);
  const firstMonthOfData = data.range.first;
  const partialYear = (y: number) => `${y}-01` < firstMonthOfData || `${y}-12` > data.range!.last;

  // Monthly spending per category for the explorer
  const cats = catMap(allCategories(db));
  const months = monthsBetween(data.range.first, data.range.last);
  const index = new Map(months.map((m, i) => [m, i]));
  const series: Record<string, number[]> = {};
  // When the latest year is still running, compare it with the same months of the year before.
  const latestYear = lastYears[lastYears.length - 1];
  const lastMonthNum = data.range.last.startsWith(String(latestYear)) ? Number(data.range.last.slice(5, 7)) : 12;
  const sameMonths = lastMonthNum < 12;
  const comparable = new Map<string, { current: number; previous: number }>();
  for (const tx of allTransactions(db, account.id)) {
    if (flowOf(tx, cats) !== "expense") continue;
    const key = String(tx.categoryId ?? "none");
    series[key] ??= Array(months.length).fill(0);
    series[key][index.get(monthOf(tx.date))!] -= tx.amount;
    const y = Number(tx.date.slice(0, 4));
    if (Number(tx.date.slice(5, 7)) <= lastMonthNum && (y === latestYear || y === latestYear - 1)) {
      const entry = comparable.get(key) ?? { current: 0, previous: 0 };
      if (y === latestYear) entry.current -= tx.amount;
      else entry.previous -= tx.amount;
      comparable.set(key, entry);
    }
  }
  const compareTotal = [...comparable.values()].reduce(
    (acc, v) => ({ current: acc.current + v.current, previous: acc.previous + v.previous }),
    { current: 0, previous: 0 },
  );
  const explorerCats = sorted
    .filter((r) => series[String(r.categoryId ?? "none")])
    .map((r) => ({ key: String(r.categoryId ?? "none"), name: r.name }));

  return (
    <div className="space-y-6">
      {!data.hasTwoYears ? (
        <Notice tone="accent">
          Year-over-year comparisons get meaningful with at least two years of data. Import older bank exports (most banks let you download several
          years) to fill in the history.
        </Notice>
      ) : null}

      <Card>
        <CardHeader title="Monthly spending, year over year" description="Each line is one calendar year. Transfers and savings are excluded." />
        <CardBody>
          <YearOverlayChart years={data.monthlyByYear.years} data={data.monthlyByYear.data} />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Biggest changes"
            description={`Last 12 months (to ${formatMonth(data.lastMonth)}) compared with the 12 months before`}
          />
          {changes.length ? (
            <Table>
              <thead>
                <tr>
                  <th className={th}>Category</th>
                  <th className={thNum}>Before</th>
                  <th className={thNum}>Last 12 mo</th>
                  <th className={thNum}>Change</th>
                </tr>
              </thead>
              <tbody>
                {changes.slice(0, 12).map((c) => (
                  <tr key={c.categoryId ?? "none"}>
                    <td className={td}>{c.name}</td>
                    <td className={`${tdNum} text-ink-2`}>{formatMoney(c.previous, { whole: true })}</td>
                    <td className={tdNum}>{formatMoney(c.current, { whole: true })}</td>
                    <td className={tdNum}>
                      <span className={c.change > 0 ? "text-critical-text" : "text-good-text"}>
                        {c.change > 0 ? "+" : "−"}
                        {formatMoney(Math.abs(c.change), { whole: true })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <CardBody>
              <p className="text-sm text-muted">Not enough data yet.</p>
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Category over time" description="Pick a category to see its monthly spending across all your data." />
          <CardBody>
            <CategoryExplorer months={months} series={series} categories={explorerCats} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Spending per year"
          description={
            sameMonths && lastYears.length > 1
              ? `Totals per category per calendar year. Because ${latestYear} isn't complete, the change compares Jan–${formatMonth(data.range.last, { short: true })} of both years.`
              : "Totals per category per calendar year; the change compares the last two years."
          }
        />
        <Table>
          <thead>
            <tr>
              <th className={th}>Category</th>
              {lastYears.map((y) => (
                <th key={y} className={thNum}>
                  {y}
                  {partialYear(y) ? <span className="font-normal text-muted"> (partial)</span> : null}
                </th>
              ))}
              {lastYears.length > 1 ? <th className={thNum}>{sameMonths ? "Change (same months)" : "Change"}</th> : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const same = comparable.get(String(r.categoryId ?? "none")) ?? { current: 0, previous: 0 };
              const a = sameMonths ? same.previous : r.byYear[lastYears[lastYears.length - 2]] ?? 0;
              const b = sameMonths ? same.current : r.byYear[lastYears[lastYears.length - 1]] ?? 0;
              return (
                <tr key={r.categoryId ?? "none"}>
                  <td className={td}>
                    {r.name} <span className="text-xs text-muted">{r.group}</span>
                  </td>
                  {lastYears.map((y) => (
                    <td key={y} className={tdNum}>
                      {r.byYear[y] ? formatMoney(r.byYear[y], { whole: true }) : <span className="text-muted">—</span>}
                    </td>
                  ))}
                  {lastYears.length > 1 ? (
                    <td className={tdNum}>
                      <Change current={b} previous={a} />
                    </td>
                  ) : null}
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className={td}>Total</td>
              {yearTotals.map((t, i) => (
                <td key={lastYears[i]} className={tdNum}>
                  {formatMoney(t, { whole: true })}
                </td>
              ))}
              {lastYears.length > 1 ? (
                <td className={tdNum}>
                  {sameMonths ? (
                    <Change current={compareTotal.current} previous={compareTotal.previous} />
                  ) : (
                    <Change current={yearTotals[yearTotals.length - 1]} previous={yearTotals[yearTotals.length - 2]} />
                  )}
                </td>
              ) : null}
            </tr>
          </tbody>
        </Table>
      </Card>

      <Card id="recurring">
        <CardHeader
          title="Subscriptions & recurring payments"
          description="Payments to the same payee at a regular interval with a stable amount. Check for price increases and things you no longer use."
        />
        {data.recurring.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Payee</th>
                <th className={th}>Category</th>
                <th className={th}>Every</th>
                <th className={th}>Last paid</th>
                <th className={thNum}>Amount</th>
                <th className={thNum}>Per year</th>
                <th className={thNum}>Price change</th>
              </tr>
            </thead>
            <tbody>
              {data.recurring.map((r) => (
                <tr key={r.key} className={r.active ? undefined : "opacity-60"}>
                  <td className={td}>
                    <span className="block max-w-56 truncate">{r.name}</span>
                    {!r.active ? <Badge>Stopped?</Badge> : null}
                  </td>
                  <td className={`${td} text-ink-2`}>{r.categoryId != null ? cats.get(r.categoryId)?.name : "—"}</td>
                  <td className={`${td} text-ink-2`}>{r.cadence === "monthly" ? "Month" : r.cadence === "quarterly" ? "Quarter" : "Year"}</td>
                  <td className={`${td} whitespace-nowrap text-ink-2`}>{formatDate(r.lastDate)}</td>
                  <td className={tdNum}>{formatMoney(r.lastAmount)}</td>
                  <td className={tdNum}>{formatMoney(r.monthlyCost * 12, { whole: true })}</td>
                  <td className={tdNum}>
                    {r.priceChange != null && Math.abs(r.priceChange) >= 0.01 ? (
                      <span className={r.priceChange > 0 ? "text-critical-text" : "text-good-text"}>
                        {r.priceChange > 0 ? "▲" : "▼"} {formatPercent(Math.abs(r.priceChange))}
                        <span className="block text-xs text-muted">since {formatDate(r.firstDate)}</span>
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={td} colSpan={5}>
                  Active recurring payments per year
                </td>
                <td className={tdNum}>
                  {formatMoney(
                    data.recurring.filter((r) => r.active).reduce((s, r) => s + r.monthlyCost * 12, 0),
                    { whole: true },
                  )}
                </td>
                <td className={td} />
              </tr>
            </tbody>
          </Table>
        ) : (
          <CardBody>
            <p className="text-sm text-muted">Nothing detected yet — this needs at least three payments to the same payee.</p>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
