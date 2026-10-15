import Link from "next/link";
import { ArrowRight, Repeat } from "lucide-react";
import { BalanceChart, CashflowChart } from "@/components/charts";
import { PeriodSelect } from "@/components/period-select";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkButton,
  Meter,
  Notice,
  StatTile,
  Table,
  td,
  tdNum,
  th,
  thNum,
} from "@/components/ui";
import type { BudgetComparison, CategoryTotal, Totals } from "@/lib/analytics";
import { currentMonth, formatDate, quarterOf, yearOf } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/format";
import type { Account } from "@/lib/db/schema";
import { getDb, requireAccount } from "@/lib/server";
import { dashboardData } from "@/lib/services/dashboard";
import { taxOverview } from "@/lib/services/tax";

export const metadata = { title: "Dashboard" };

function delta(current: number, previous: number | undefined, higherIsGood: boolean, label: string) {
  if (previous == null || previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  if (!Number.isFinite(change)) return null;
  const up = change > 0;
  const text = `${up ? "▲" : "▼"} ${formatPercent(Math.abs(change))} vs ${label}`;
  return { text, good: Math.abs(change) < 0.005 ? null : up === higherIsGood };
}

export default async function DashboardPage({ params, searchParams }: PageProps<"/accounts/[accountId]">) {
  const { accountId } = await params;
  const { period: periodKey } = await searchParams;
  const account = requireAccount(accountId);
  const db = getDb();
  const data = dashboardData(db, account, typeof periodKey === "string" ? periodKey : undefined);
  const base = `/accounts/${account.id}`;
  const business = account.kind === "business";

  if (!data.range) {
    return (
      <EmptyState
        title="No transactions yet"
        action={
          <LinkButton href={`${base}/import`} variant="primary">
            Import a bank export <ArrowRight className="size-4" aria-hidden />
          </LinkButton>
        }
      >
        Download your transactions from your bank (CSV, CAMT.053 or MT940) and import them to see your dashboard.
      </EmptyState>
    );
  }

  const prevLabel = data.period.months.length === 1 ? "previous month" : `previous ${data.period.months.length} months`;
  const t = data.totals;
  const p = data.previousTotals;
  const from = `${data.period.months[0]}-01`;
  const to = `${data.period.months[data.period.months.length - 1]}-31`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelect options={data.periodOptions} value={data.period.key} />
        <p className="text-xs text-muted">
          Data from {formatDate(`${data.range.first}-01`).replace(/^1 /, "")} to {formatDate(`${data.range.last}-01`).replace(/^1 /, "")}
        </p>
      </div>

      {data.uncategorised > 0 ? (
        <Notice tone="warning">
          <span className="font-medium text-ink">{data.uncategorised} transactions</span> in this period aren&apos;t categorised yet, so the
          breakdown below is incomplete.{" "}
          <Link className="font-medium text-accent underline-offset-2 hover:underline" href={`${base}/transactions?category=none`}>
            Review them
          </Link>
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={business ? "Money in" : "Income"} value={formatMoney(t.income, { whole: true })} delta={delta(t.income, p?.income, true, prevLabel)} />
        <StatTile label={business ? "Costs" : "Spending"} value={formatMoney(t.expenses, { whole: true })} delta={delta(t.expenses, p?.expenses, false, prevLabel)} />
        <StatTile
          label={business ? "Result (incl. VAT)" : t.net >= 0 ? "Saved" : "Overspent"}
          value={formatMoney(business ? t.net : Math.abs(t.net), { whole: true })}
          delta={delta(t.net, p?.net, true, prevLabel)}
          hint={
            business
              ? "Before tax payments and private withdrawals"
              : data.toSavings
                ? `${data.toSavings > 0 ? "Moved to savings" : "Taken from savings"}: ${formatMoney(Math.abs(data.toSavings), { whole: true })}`
                : undefined
          }
        />
        <SavingsRateTile totals={t} previous={p} label={business ? "Margin" : "Savings rate"} hint={business ? "Result as share of money in" : "Share of income not spent"} />
      </div>

      {business ? <BusinessSnapshot account={account} /> : null}

      <Card>
        <CardHeader title="Income and spending per month" description="Transfers between your own accounts and savings are left out." />
        <CardBody>
          <CashflowChart data={data.monthly} />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Where the money went"
            description={data.period.label}
            action={
              <LinkButton size="sm" variant="ghost" href={`${base}/transactions?from=${from}&to=${to}`}>
                Transactions
              </LinkButton>
            }
          />
          <CardBody>
            <CategoryBars rows={data.expenseCategories} budget={data.budget} base={base} from={from} to={to} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Budget vs. actual"
            description={data.hasBudget ? `${data.period.label}, planned amounts pro rata` : "Compare your estimates with what you actually spent"}
            action={
              <LinkButton size="sm" variant="ghost" href={`${base}/budget`}>
                {data.hasBudget ? "Edit budget" : "Set up budget"}
              </LinkButton>
            }
          />
          {data.hasBudget ? (
            <BudgetTable rows={data.budget} />
          ) : (
            <CardBody>
              <EmptyState title="No budget yet">
                Add your fixed costs and estimates, or import them from your Excel sheet, to see how reality compares.
              </EmptyState>
            </CardBody>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Balance" description="Month-end balance" />
          <CardBody>
            <BalanceChart data={data.balance} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Recurring payments"
            description="Detected subscriptions and fixed costs"
            action={
              <LinkButton size="sm" variant="ghost" href={`${base}/trends#recurring`}>
                All
              </LinkButton>
            }
          />
          {data.recurring.length ? (
            <Table>
              <tbody>
                {data.recurring.map((r) => (
                  <tr key={r.key}>
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <Repeat className="size-3.5 shrink-0 text-muted" aria-hidden />
                        <span className="truncate">{r.name}</span>
                      </span>
                    </td>
                    <td className={`${td} text-ink-2`}>{r.cadence}</td>
                    <td className={tdNum}>{formatMoney(r.lastAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <CardBody>
              <p className="text-sm text-muted">Nothing detected yet. Recurring payments show up after about three months of data.</p>
            </CardBody>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Income sources" description={data.period.label} />
          <Table>
            <tbody>
              {data.incomeCategories.slice(0, 8).map((c) => (
                <tr key={c.categoryId ?? "none"}>
                  <td className={td}>{c.name}</td>
                  <td className={tdNum}>{formatMoney(c.total)}</td>
                </tr>
              ))}
              {!data.incomeCategories.length ? (
                <tr>
                  <td className={`${td} text-muted`}>No income in this period</td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Top payees" description={data.period.label} />
          <Table>
            <tbody>
              {data.topCounterparties.map((c) => (
                <tr key={c.name}>
                  <td className={td}>
                    <span className="block truncate">{c.name}</span>
                  </td>
                  <td className={`${td} text-right text-ink-2`}>{c.count}×</td>
                  <td className={tdNum}>{formatMoney(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function SavingsRateTile({ totals, previous, label, hint }: { totals: Totals; previous: Totals | null; label: string; hint: string }) {
  const rate = totals.savingsRate;
  const prev = previous?.savingsRate;
  return (
    <StatTile
      label={label}
      value={rate == null ? "—" : formatPercent(rate)}
      delta={
        rate != null && prev != null
          ? {
              text: `${rate >= prev ? "▲" : "▼"} ${formatPercent(Math.abs(rate - prev), 1).replace("%", "")} pts vs before`,
              good: Math.abs(rate - prev) < 0.005 ? null : rate > prev,
            }
          : null
      }
      hint={hint}
    />
  );
}

function CategoryBars({
  rows,
  budget,
  base,
  from,
  to,
}: {
  rows: CategoryTotal[];
  budget: BudgetComparison[];
  base: string;
  from: string;
  to: string;
}) {
  const positive = rows.filter((r) => r.total > 0);
  if (!positive.length) return <p className="text-sm text-muted">No spending in this period.</p>;
  const top = positive.slice(0, 10);
  const rest = positive.slice(10);
  const other = rest.reduce((s, r) => s + r.total, 0);
  const total = positive.reduce((s, r) => s + r.total, 0);
  const budgetFor = new Map(budget.map((b) => [b.categoryId, b.budget]));
  const max = Math.max(...top.map((r) => Math.max(r.total, budgetFor.get(r.categoryId) ?? 0)), other);
  const list = other > 0 ? [...top, { categoryId: -1, name: `Other (${rest.length})`, total: other, count: 0 } as CategoryTotal] : top;

  return (
    <ul className="space-y-2.5">
      {list.map((r) => {
        const planned = r.categoryId != null ? budgetFor.get(r.categoryId) : undefined;
        const href =
          r.categoryId === -1 ? null : `${base}/transactions?category=${r.categoryId ?? "none"}&from=${from}&to=${to}`;
        const label = href ? (
          <Link href={href} className="truncate hover:underline">
            {r.name}
          </Link>
        ) : (
          <span className="truncate">{r.name}</span>
        );
        return (
          <li key={r.categoryId ?? "none"} title={planned ? `Budget ${formatMoney(planned)}` : undefined}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-baseline gap-2 text-ink">{label}</span>
              <span className="shrink-0 text-ink tabular">
                {formatMoney(r.total, { whole: true })}{" "}
                <span className="text-xs text-muted">{formatPercent(r.total / total)}</span>
              </span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-surface-2">
              <div className="h-2 rounded-full" style={{ width: `${(r.total / max) * 100}%`, background: "var(--series-1)" }} />
              {planned ? (
                <div
                  className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink"
                  style={{ left: `calc(${Math.min(100, (planned / max) * 100)}% - 1px)` }}
                  aria-label={`Budget ${formatMoney(planned)}`}
                />
              ) : null}
            </div>
          </li>
        );
      })}
      {budget.length ? (
        <li className="flex items-center gap-1.5 pt-1 text-xs text-muted">
          <span className="inline-block h-3 w-0.5 rounded bg-ink" /> budget for the period
        </li>
      ) : null}
    </ul>
  );
}

function BudgetTable({ rows }: { rows: BudgetComparison[] }) {
  const expenses = rows.filter((r) => r.kind === "expense" && (r.budget > 0 || r.actual > 0));
  const planned = expenses.reduce((s, r) => s + r.budget, 0);
  const actual = expenses.reduce((s, r) => s + r.actual, 0);
  const shown = [...expenses].sort((a, b) => b.budget - a.budget || b.actual - a.actual).slice(0, 12);
  return (
    <Table>
      <thead>
        <tr>
          <th className={th}>Category</th>
          <th className={thNum}>Actual</th>
          <th className={thNum}>Budget</th>
          <th className={`${th} w-28`}>
            <span className="sr-only">Progress</span>
          </th>
          <th className={thNum}>Difference</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((r) => (
          <tr key={r.categoryId ?? "none"}>
            <td className={td}>
              <span className="block max-w-48 truncate">{r.name}</span>
            </td>
            <td className={tdNum}>{formatMoney(r.actual, { whole: true })}</td>
            <td className={`${tdNum} text-ink-2`}>{r.budget ? formatMoney(r.budget, { whole: true }) : "—"}</td>
            <td className={`${td} align-middle`}>
              <Meter value={r.actual} max={r.budget} label={`${r.name} budget used`} />
            </td>
            <td className={`${tdNum} ${r.difference >= 0 ? "text-good-text" : "text-critical-text"}`}>
              {r.difference >= 0 ? "" : "−"}
              {formatMoney(Math.abs(r.difference), { whole: true })}
            </td>
          </tr>
        ))}
        <tr className="font-semibold">
          <td className={td}>Total spending</td>
          <td className={tdNum}>{formatMoney(actual, { whole: true })}</td>
          <td className={tdNum}>{formatMoney(planned, { whole: true })}</td>
          <td className={`${td} align-middle`}>
            <Meter value={actual} max={planned} label="Total budget used" />
          </td>
          <td className={`${tdNum} ${planned - actual >= 0 ? "text-good-text" : "text-critical-text"}`}>
            {planned - actual >= 0 ? "" : "−"}
            {formatMoney(Math.abs(planned - actual), { whole: true })}
          </td>
        </tr>
      </tbody>
    </Table>
  );
}

function BusinessSnapshot({ account }: { account: Account }) {
  const db = getDb();
  const year = yearOf(currentMonth());
  const overview = taxOverview(db, account, year);
  // Latest quarter that has transactions (the current one may not be imported yet).
  const current = quarterOf(currentMonth());
  const vat = [...overview.vat].reverse().find((v) => v.quarter <= current && v.transactionCount > 0) ?? overview.vat.find((v) => v.quarter === current);
  const quarter = vat?.quarter ?? current;
  const base = `/accounts/${account.id}/tax`;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label={`Revenue ${year} (excl. VAT)`} value={formatMoney(overview.pnl.totalIncome, { whole: true })} />
      <StatTile label={`Profit ${year} so far`} value={formatMoney(overview.pnl.profit, { whole: true })} hint={<Link className="text-accent hover:underline" href={base}>Profit & loss</Link>} />
      <StatTile
        label={account.vatKor ? "VAT" : `VAT Q${quarter} so far`}
        value={account.vatKor ? "KOR" : vat ? formatMoney(vat.balance, { whole: true }) : "—"}
        hint={account.vatKor ? "Small business scheme: no VAT returns" : vat && vat.balance < 0 ? "To reclaim" : "To pay"}
      />
      <StatTile
        label="Income tax reserve"
        value={formatMoney(Math.max(0, overview.incomeTaxRemaining), { whole: true })}
        hint={<Link className="text-accent hover:underline" href={base}>Indicative estimate</Link>}
      />
    </div>
  );
}
