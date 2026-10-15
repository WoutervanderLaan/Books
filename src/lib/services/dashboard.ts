import {
  balanceByMonth,
  budgetVsActual,
  catMap,
  categoryTotals,
  detectRecurring,
  monthlySpendingByYear,
  monthlyTotals,
  monthRange,
  rollingYearChanges,
  spendingByYear,
  topCounterparties,
  totals,
  type TxRow,
} from "../analytics";
import { isInternal, movedToSavings, putAside } from "../analytics/transfers";
import { addMonths, currentMonth, formatMonth, monthOf, monthsBetween, yearOf } from "../dates";
import type { DB } from "../db/connection";
import type { Account } from "../db/schema";
import { normalizeIban } from "../text";
import { accountStats, allCategories, listAccounts } from "./accounts";
import { listBudgetLines } from "./budget";
import { allTransactions } from "./transactions";

export interface Period {
  key: string;
  label: string;
  months: string[];
}

export interface PeriodOption {
  key: string;
  label: string;
}

/** Resolves a period key relative to the latest month with data (imports lag behind today). */
export function resolvePeriod(key: string | undefined, range: { first: string; last: string } | null): Period {
  const anchor = range?.last ?? currentMonth();
  const k = key ?? "12m";
  if (k === "ytd") return { key: k, label: `${anchor.slice(0, 4)} to date`, months: monthsBetween(`${anchor.slice(0, 4)}-01`, anchor) };
  if (k === "all" && range) return { key: k, label: "All time", months: monthsBetween(range.first, range.last) };
  const year = k.match(/^year-(\d{4})$/);
  if (year) return { key: k, label: year[1], months: monthsBetween(`${year[1]}-01`, `${year[1]}-12`) };
  const month = k.match(/^month-(\d{4}-\d{2})$/);
  if (month) return { key: k, label: formatMonth(month[1]), months: [month[1]] };
  return { key: "12m", label: "Last 12 months", months: monthsBetween(addMonths(anchor, -11), anchor) };
}

export function periodOptions(range: { first: string; last: string } | null): PeriodOption[] {
  const options: PeriodOption[] = [
    { key: "12m", label: "Last 12 months" },
    { key: "ytd", label: "Year to date" },
  ];
  if (!range) return options;
  for (let m = range.last, i = 0; m >= range.first && i < 6; m = addMonths(m, -1), i++) {
    options.push({ key: `month-${m}`, label: formatMonth(m) });
  }
  for (let y = yearOf(range.last); y >= yearOf(range.first); y--) options.push({ key: `year-${y}`, label: String(y) });
  options.push({ key: "all", label: "All time" });
  return options;
}

function previousMonths(months: string[]): string[] {
  if (!months.length) return [];
  return monthsBetween(addMonths(months[0], -months.length), addMonths(months[0], -1));
}

const toRow = (t: ReturnType<typeof allTransactions>[number]): TxRow => ({
  id: t.id,
  date: t.date,
  amount: t.amount,
  categoryId: t.categoryId,
  counterpartyName: t.counterpartyName,
  counterpartyIban: t.counterpartyIban,
  description: t.description,
});

export function dashboardData(db: DB, account: Account, periodKey?: string) {
  const all = allTransactions(db, account.id).map(toRow);
  const cats = allCategories(db);
  const map = catMap(cats);
  const range = monthRange(all);
  const period = resolvePeriod(periodKey, range);
  const monthSet = new Set(period.months);
  const inPeriod = all.filter((t) => monthSet.has(monthOf(t.date)));
  const prevMonths = previousMonths(period.months);
  const prevSet = new Set(prevMonths);
  const inPrevious = all.filter((t) => prevSet.has(monthOf(t.date)));

  // A single month still gets a year of context in the trend chart.
  const chartMonths = period.months.length >= 6 ? period.months : monthsBetween(addMonths(period.months[period.months.length - 1], -11), period.months[period.months.length - 1]);
  const lines = listBudgetLines(db, account.id);
  const roles = new Map(cats.map((c) => [c.id, c.role]));
  const savingsIbans = new Set(
    listAccounts(db)
      .filter((a) => a.isSavings && a.id !== account.id && a.iban)
      .map((a) => normalizeIban(a.iban)!),
  );
  const flows = (rows: TxRow[]) => rows.map((t) => ({ ...t, accountId: account.id }));

  return {
    range,
    period,
    periodOptions: periodOptions(range),
    totals: totals(inPeriod, map),
    previousTotals: inPrevious.length ? totals(inPrevious, map) : null,
    monthly: monthlyTotals(all, map, chartMonths),
    expenseCategories: categoryTotals(inPeriod, map, "expense"),
    incomeCategories: categoryTotals(inPeriod, map, "income"),
    budget: lines.length ? budgetVsActual(lines, all, map, period.months) : [],
    hasBudget: lines.length > 0,
    balance: balanceByMonth(all, account.openingBalance, chartMonths),
    recurring: detectRecurring(all, map).filter((r) => r.active).slice(0, 8),
    topCounterparties: topCounterparties(inPeriod, map, 8),
    uncategorised: inPeriod.filter((t) => t.categoryId == null).length,
    transactionCount: inPeriod.length,
    /** Net moved to savings in the period; null for savings accounts themselves. */
    toSavings: account.isSavings ? null : movedToSavings(flows(inPeriod), roles, savingsIbans),
  };
}

export type DashboardData = ReturnType<typeof dashboardData>;

export function trendsData(db: DB, account: Account) {
  const all = allTransactions(db, account.id).map(toRow);
  const cats = allCategories(db);
  const map = catMap(cats);
  const range = monthRange(all);
  const byYear = spendingByYear(all, map);
  const lastMonth = range?.last ?? currentMonth();
  return {
    range,
    byYear,
    monthlyByYear: monthlySpendingByYear(all, map),
    changes: rollingYearChanges(all, map, lastMonth),
    hasTwoYears: !!range && range.first <= addMonths(lastMonth, -23),
    lastMonth,
    recurring: detectRecurring(all, map),
    categories: cats.map((c) => ({ id: c.id, name: c.name })),
  };
}

export type TrendsData = ReturnType<typeof trendsData>;

/**
 * One dashboard over all active personal accounts. Money moving between them is
 * neither income nor spending, whatever its category; balances are added up.
 */
export function combinedData(db: DB, periodKey?: string) {
  const included = listAccounts(db).filter((a) => a.kind === "personal");
  const ownIbans = new Set(included.map((a) => normalizeIban(a.iban)).filter((i): i is string => !!i));
  const cats = allCategories(db);
  const map = catMap(cats);
  const roles = new Map(cats.map((c) => [c.id, c.role]));

  const raw = included
    .flatMap((a) => allTransactions(db, a.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const all = raw.map(toRow);
  const external = raw.filter((t) => !isInternal(t, ownIbans)).map(toRow);
  const range = monthRange(all);
  const period = resolvePeriod(periodKey, range);
  const monthSet = new Set(period.months);
  const prevSet = new Set(previousMonths(period.months));
  const inMonths = <T extends { date: string }>(rows: T[], set: Set<string>) => rows.filter((t) => set.has(monthOf(t.date)));
  const inPeriod = inMonths(external, monthSet);
  const inPrevious = inMonths(external, prevSet);
  const chartMonths = period.months.length >= 6 ? period.months : monthsBetween(addMonths(period.months[period.months.length - 1], -11), period.months[period.months.length - 1]);
  const opening = included.reduce((s, a) => s + a.openingBalance, 0);
  const savings = included
    .filter((a) => a.isSavings)
    .map((a) => {
      const own = raw.filter((t) => t.accountId === a.id);
      return { id: a.id, iban: a.iban, first: own[0]?.date ?? null, last: own[own.length - 1]?.date ?? null };
    });
  const savedIn = (set: Set<string>) => putAside(inMonths(raw, set), roles, savings, ownIbans);

  return {
    accounts: included.map((a) => {
      const own = inMonths(raw.filter((t) => t.accountId === a.id), monthSet);
      const ext = own.filter((t) => !isInternal(t, ownIbans)).map(toRow);
      const tot = totals(ext, map);
      return {
        account: a,
        balance: accountStats(db, a).balance,
        income: tot.income,
        expenses: tot.expenses,
        /** Net money in from (+) or out to (−) your other accounts */
        internal: own.filter((t) => isInternal(t, ownIbans)).reduce((s, t) => s + t.amount, 0),
      };
    }),
    hasSavingsAccount: savings.length > 0,
    range,
    period,
    periodOptions: periodOptions(range),
    totals: totals(inPeriod, map),
    previousTotals: inPrevious.length ? totals(inPrevious, map) : null,
    putAside: savedIn(monthSet),
    previousPutAside: inPrevious.length ? savedIn(prevSet) : null,
    monthly: monthlyTotals(external, map, chartMonths),
    expenseCategories: categoryTotals(inPeriod, map, "expense"),
    incomeCategories: categoryTotals(inPeriod, map, "income"),
    balance: balanceByMonth(all, opening, chartMonths),
    topCounterparties: topCounterparties(inPeriod, map, 8),
    uncategorised: inPeriod.filter((t) => t.categoryId == null).length,
  };
}

export type CombinedData = ReturnType<typeof combinedData>;
