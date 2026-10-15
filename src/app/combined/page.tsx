import Link from "next/link";
import { PiggyBank, Wallet } from "lucide-react";
import { BalanceChart, CashflowChart } from "@/components/charts";
import { PeriodSelect } from "@/components/period-select";
import { Amount, Card, CardBody, CardHeader, EmptyState, LinkButton, Notice, PageHeader, StatTile, Table, td, tdNum, th, thNum } from "@/components/ui";
import type { CategoryTotal } from "@/lib/analytics";
import { formatMoney, formatPercent } from "@/lib/format";
import { getDb } from "@/lib/server";
import { combinedData } from "@/lib/services/dashboard";

export const metadata = { title: "All personal accounts" };

function delta(current: number, previous: number | null | undefined, higherIsGood: boolean) {
  if (previous == null || previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  if (!Number.isFinite(change)) return null;
  return {
    text: `${change > 0 ? "▲" : "▼"} ${formatPercent(Math.abs(change))} vs before`,
    good: Math.abs(change) < 0.005 ? null : change > 0 === higherIsGood,
  };
}

export default async function CombinedPage({ searchParams }: PageProps<"/combined">) {
  const { period: periodKey } = await searchParams;
  const data = combinedData(getDb(), typeof periodKey === "string" ? periodKey : undefined);

  if (!data.range) {
    return (
      <>
        <PageHeader title="All personal accounts" />
        <EmptyState title="No transactions yet" action={<LinkButton href="/accounts/new">Add an account</LinkButton>}>
          Import statements for your personal accounts to see them combined here.
        </EmptyState>
      </>
    );
  }

  const t = data.totals;
  const p = data.previousTotals;
  const freeCash = t.net - data.putAside;

  return (
    <>
      <PageHeader
        title="All personal accounts"
        description="Your personal accounts as one household. Money moving between them is neither income nor spending; what goes into savings shows up as put aside."
      />
      <div className="space-y-6">
        <PeriodSelect options={data.periodOptions} value={data.period.key} />

        {data.uncategorised > 0 ? (
          <Notice tone="warning">
            <span className="font-medium text-ink">{data.uncategorised} transactions</span> in this period aren&apos;t categorised yet, so the figures below are incomplete.
          </Notice>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Income" value={formatMoney(t.income, { whole: true })} delta={delta(t.income, p?.income, true)} />
          <StatTile label="Spending" value={formatMoney(t.expenses, { whole: true })} delta={delta(t.expenses, p?.expenses, false)} />
          <StatTile
            label={t.net >= 0 ? "Income left over" : "Spent more than earned"}
            value={formatMoney(Math.abs(t.net), { whole: true })}
            delta={delta(t.net, p?.net, true)}
            hint={t.savingsRate != null ? `${formatPercent(t.savingsRate)} of income` : undefined}
          />
          <StatTile
            label="Put aside in savings"
            value={data.hasSavingsAccount || data.putAside ? formatMoney(data.putAside, { whole: true }) : "—"}
            delta={delta(data.putAside, data.previousPutAside, true)}
            hint={
              data.hasSavingsAccount ? (
                `${freeCash >= 0 ? "+" : "−"}${formatMoney(Math.abs(freeCash), { whole: true })} on your other accounts`
              ) : (
                <span>
                  Mark an account as savings in its <span className="font-medium">settings</span>
                </span>
              )
            }
          />
        </div>

        <Card>
          <CardHeader title="Accounts" description={`${data.period.label}. Transfers are money moved to (−) or from (+) your other accounts.`} />
          <Table>
            <thead>
              <tr>
                <th className={th}>Account</th>
                <th className={thNum}>Income</th>
                <th className={thNum}>Spending</th>
                <th className={thNum}>Transfers</th>
                <th className={thNum}>Balance now</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.account.id}>
                  <td className={td}>
                    <Link href={`/accounts/${a.account.id}`} className="flex items-center gap-2 hover:underline">
                      {a.account.isSavings ? <PiggyBank className="size-3.5 text-muted" aria-hidden /> : <Wallet className="size-3.5 text-muted" aria-hidden />}
                      {a.account.name}
                    </Link>
                  </td>
                  <td className={tdNum}>{formatMoney(a.income, { whole: true })}</td>
                  <td className={tdNum}>{formatMoney(a.expenses, { whole: true })}</td>
                  <td className={`${td} text-right`}>
                    <Amount cents={a.internal} whole />
                  </td>
                  <td className={tdNum}>{formatMoney(a.balance, { whole: true })}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={td}>Together</td>
                <td className={tdNum}>{formatMoney(t.income, { whole: true })}</td>
                <td className={tdNum}>{formatMoney(t.expenses, { whole: true })}</td>
                <td className={`${td} text-right`}>
                  <Amount cents={data.accounts.reduce((s, a) => s + a.internal, 0)} whole />
                </td>
                <td className={tdNum}>{formatMoney(data.accounts.reduce((s, a) => s + a.balance, 0), { whole: true })}</td>
              </tr>
            </tbody>
          </Table>
          {data.accounts.reduce((s, a) => s + a.internal, 0) !== 0 ? (
            <p className="px-5 py-3 text-xs text-muted">
              Transfers don&apos;t add up to zero: some appear in only one account, usually because the other account&apos;s statements for that
              period aren&apos;t imported yet.{" "}
              <Link className="text-accent hover:underline" href="/transfers">
                Check own transfers
              </Link>
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Income and spending per month" description="All personal accounts together, transfers between them left out." />
          <CardBody>
            <CashflowChart data={data.monthly} />
          </CardBody>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Where the money went" description={data.period.label} />
            <CardBody>
              <Bars rows={data.expenseCategories} empty="No spending in this period." />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Combined balance" description="Month-end, all personal accounts" />
            <CardBody>
              <BalanceChart data={data.balance} />
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Income sources" description={data.period.label} />
            <CardBody>
              <Bars rows={data.incomeCategories} empty="No income in this period." />
            </CardBody>
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
    </>
  );
}

function Bars({ rows, empty }: { rows: CategoryTotal[]; empty: string }) {
  const positive = rows.filter((r) => r.total > 0);
  if (!positive.length) return <p className="text-sm text-muted">{empty}</p>;
  const top = positive.slice(0, 10);
  const rest = positive.slice(10).reduce((s, r) => s + r.total, 0);
  const list = rest > 0 ? [...top, { categoryId: -1, name: `Other (${positive.length - 10})`, total: rest } as CategoryTotal] : top;
  const total = positive.reduce((s, r) => s + r.total, 0);
  const max = Math.max(...list.map((r) => r.total));
  return (
    <ul className="space-y-2.5">
      {list.map((r) => (
        <li key={r.categoryId ?? "none"}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink">{r.name}</span>
            <span className="shrink-0 text-ink tabular">
              {formatMoney(r.total, { whole: true })} <span className="text-xs text-muted">{formatPercent(r.total / total)}</span>
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full" style={{ width: `${(r.total / max) * 100}%`, background: "var(--series-1)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
