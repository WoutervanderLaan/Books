import { Card, CardHeader, EmptyState, StatTile, Table, td, tdNum, th, thNum } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { deleteBudgetLineAction } from "@/app/actions/budget";
import { budgetVsActual, catMap, lineActiveIn, monthlyEquivalent, monthRange, type BudgetComparison } from "@/lib/analytics";
import { addMonths, currentMonth, formatMonth, monthsBetween } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { getDb, requireAccount } from "@/lib/server";
import { allCategories, categoriesFor } from "@/lib/services/accounts";
import { listBudgetLines } from "@/lib/services/budget";
import { allTransactions } from "@/lib/services/transactions";
import { BudgetLineForm } from "./budget-line-form";
import { SpreadsheetImport } from "./spreadsheet-import";

export const metadata = { title: "Budget" };

export default async function BudgetPage({ params }: PageProps<"/accounts/[accountId]/budget">) {
  const { accountId } = await params;
  const account = requireAccount(accountId);
  const db = getDb();
  const categories = categoriesFor(db, account.kind);
  const cats = catMap(allCategories(db));
  const lines = listBudgetLines(db, account.id);
  const txs = allTransactions(db, account.id);

  // Compare the plan with the average of the last 12 months that have data.
  const range = monthRange(txs);
  const last = range?.last ?? currentMonth();
  const first = range ? (range.first > addMonths(last, -11) ? range.first : addMonths(last, -11)) : last;
  const months = monthsBetween(first, last);
  const comparison = budgetVsActual(lines, txs, cats, months);
  const byCategory = new Map(comparison.map((c) => [c.categoryId, c]));

  const now = currentMonth();
  const active = lines.filter((l) => lineActiveIn(l, now));
  const monthly = (pred: (l: (typeof lines)[number]) => boolean) =>
    Math.round(active.filter(pred).reduce((s, l) => s + monthlyEquivalent(l), 0));
  const isIncome = (l: (typeof lines)[number]) => (l.categoryId != null ? cats.get(l.categoryId)?.kind === "income" : false);
  const plannedIncome = monthly(isIncome);
  const fixed = monthly((l) => !isIncome(l) && l.type === "fixed");
  const variable = monthly((l) => !isIncome(l) && l.type === "variable");

  // Group lines by category group for display
  const groups = new Map<string, typeof lines>();
  for (const line of lines) {
    const group = line.categoryId != null ? cats.get(line.categoryId)?.groupName ?? "Unassigned" : "Unassigned";
    groups.set(group, [...(groups.get(group) ?? []), line]);
  }
  const unbudgeted = comparison.filter((c) => c.budget === 0 && c.actual > 0 && c.kind === "expense").sort((a, b) => b.actual - a.actual);
  const perMonth = (c: BudgetComparison | undefined) => (c ? Math.round(c.actual / months.length) : 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Planned income / month" value={formatMoney(plannedIncome, { whole: true })} />
        <StatTile label="Fixed costs / month" value={formatMoney(fixed, { whole: true })} />
        <StatTile label="Variable estimates / month" value={formatMoney(variable, { whole: true })} />
        <StatTile
          label="Planned to save / month"
          value={formatMoney(plannedIncome - fixed - variable, { whole: true })}
          hint={plannedIncome ? undefined : "Add your income to see this"}
        />
      </div>

      <Card>
        <CardHeader
          title="Your budget"
          description={
            range
              ? `Monthly equivalents (yearly ÷ 12, quarterly ÷ 3) next to your actual monthly average over ${formatMonth(first)} – ${formatMonth(last)}.`
              : "Monthly equivalents of your fixed costs and estimates."
          }
          action={
            <div className="flex gap-2">
              <SpreadsheetImport accountId={account.id} categories={categories} />
              <BudgetLineForm accountId={account.id} categories={categories} />
            </div>
          }
        />
        {lines.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Item</th>
                <th className={th}>Category</th>
                <th className={th}>Type</th>
                <th className={thNum}>Amount</th>
                <th className={thNum}>Per month</th>
                <th className={thNum}>Actual / month</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...groups.entries()].map(([group, groupLines]) => (
                <GroupRows
                  key={group}
                  group={group}
                  lines={groupLines}
                  categories={categories}
                  catName={(id) => (id != null ? cats.get(id)?.name ?? "—" : "—")}
                  actual={(id) => perMonth(byCategory.get(id))}
                  accountId={account.id}
                />
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="px-5 pb-5">
            <EmptyState title="No budget lines yet">
              Add your fixed monthly costs (rent, insurance, subscriptions) and estimates for variable spending (groceries, going out), or import
              them from your Excel sheet. Assign each line a category so it can be compared with your actual spending.
            </EmptyState>
          </div>
        )}
      </Card>

      {unbudgeted.length && lines.length ? (
        <Card>
          <CardHeader title="Spending without a budget" description="Categories you spent money on that aren't in your plan (monthly average)." />
          <Table>
            <tbody>
              {unbudgeted.slice(0, 15).map((c) => (
                <tr key={c.categoryId ?? "none"}>
                  <td className={td}>{c.name}</td>
                  <td className={`${td} text-ink-2`}>{c.group}</td>
                  <td className={tdNum}>{formatMoney(Math.round(c.actual / months.length))}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

function GroupRows({
  group,
  lines,
  categories,
  catName,
  actual,
  accountId,
}: {
  group: string;
  lines: ReturnType<typeof listBudgetLines>;
  categories: ReturnType<typeof categoriesFor>;
  catName: (id: number | null) => string;
  actual: (id: number | null) => number;
  accountId: number;
}) {
  const seen = new Set<number | null>();
  const total = Math.round(lines.reduce((s, l) => s + monthlyEquivalent(l), 0));
  const categoryIds = [...new Set(lines.map((l) => l.categoryId).filter((id): id is number => id != null))];
  const groupActual = categoryIds.reduce((s, id) => s + actual(id), 0);
  const linesPerCategory = (id: number | null) => lines.filter((l) => l.categoryId === id).length;
  return (
    <>
      <tr>
        <td colSpan={4} className="border-b border-line bg-surface-2 px-5 py-1.5 text-xs font-semibold text-ink-2">
          {group}
        </td>
        <td className="border-b border-line bg-surface-2 px-3 py-1.5 text-right text-xs font-semibold text-ink-2 tabular">{formatMoney(total)}</td>
        <td className="border-b border-line bg-surface-2 px-3 py-1.5 text-right text-xs font-semibold text-ink-2 tabular">{formatMoney(groupActual)}</td>
        <td className="border-b border-line bg-surface-2" />
      </tr>
      {lines.map((line) => {
        // Show the category's actual average once, on its first line.
        const firstOfCategory = !seen.has(line.categoryId);
        seen.add(line.categoryId);
        return (
          <tr key={line.id}>
            <td className={td}>
              <p>{line.name}</p>
              {line.startMonth || line.endMonth ? (
                <p className="text-xs text-muted">
                  {line.startMonth ? `from ${formatMonth(line.startMonth)}` : ""} {line.endMonth ? `until ${formatMonth(line.endMonth)}` : ""}
                </p>
              ) : null}
            </td>
            <td className={`${td} text-ink-2`}>{catName(line.categoryId)}</td>
            <td className={`${td} text-ink-2`}>{line.type === "fixed" ? "Fixed" : "Estimate"}</td>
            <td className={tdNum}>
              {formatMoney(line.amount)} <span className="text-xs text-muted">/{line.frequency === "monthly" ? "mo" : line.frequency === "quarterly" ? "qtr" : "yr"}</span>
            </td>
            <td className={tdNum}>{formatMoney(Math.round(monthlyEquivalent(line)))}</td>
            <td className={`${tdNum} text-ink-2`}>
              {firstOfCategory && line.categoryId != null ? (
                <>
                  {formatMoney(actual(line.categoryId))}
                  {linesPerCategory(line.categoryId) > 1 ? (
                    <span className="block text-xs text-muted">for {linesPerCategory(line.categoryId)} lines</span>
                  ) : null}
                </>
              ) : line.categoryId != null ? (
                <span className="text-xs text-muted">↑ included</span>
              ) : null}
            </td>
            <td className={`${td} text-right`}>
              <div className="flex justify-end gap-1">
                <BudgetLineForm accountId={accountId} categories={categories} line={line} />
                <ConfirmButton action={deleteBudgetLineAction.bind(null, line.id)} confirm={`Delete “${line.name}”?`} variant="ghost">
                  Delete
                </ConfirmButton>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
