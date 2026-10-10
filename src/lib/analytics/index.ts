import { addMonths, daysBetween, monthOf, monthsBetween, yearOf } from "../dates";
import { counterpartyKey } from "../rules/engine";
import type { BudgetFrequency, BudgetType, CategoryKind, CategoryRole } from "../types";

export interface TxRow {
  id: number;
  date: string;
  amount: number;
  categoryId: number | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  description: string;
}

export interface CatRow {
  id: number;
  name: string;
  groupName: string;
  kind: CategoryKind;
  role: CategoryRole | null;
}

export interface BudgetRow {
  id: number;
  categoryId: number | null;
  name: string;
  amount: number;
  frequency: BudgetFrequency;
  type: BudgetType;
  startMonth: string | null;
  endMonth: string | null;
}

export type Flow = "income" | "expense" | "transfer";

/** Income/expense/transfer for a transaction; uncategorised ones go by sign. */
export function flowOf(tx: { amount: number; categoryId: number | null }, cats: Map<number, CatRow>): Flow {
  const cat = tx.categoryId != null ? cats.get(tx.categoryId) : undefined;
  if (!cat) return tx.amount >= 0 ? "income" : "expense";
  return cat.kind;
}

export const catMap = (cats: CatRow[]) => new Map(cats.map((c) => [c.id, c]));

export interface MonthTotals {
  month: string;
  income: number;
  expenses: number;
  net: number;
  transfers: number;
}

/** Income and spending per month. Refunds in an expense category reduce spending. */
export function monthlyTotals(txs: TxRow[], cats: Map<number, CatRow>, months: string[]): MonthTotals[] {
  const byMonth = new Map(months.map((m) => [m, { month: m, income: 0, expenses: 0, net: 0, transfers: 0 }]));
  for (const tx of txs) {
    const row = byMonth.get(monthOf(tx.date));
    if (!row) continue;
    const flow = flowOf(tx, cats);
    if (flow === "income") row.income += tx.amount;
    else if (flow === "expense") row.expenses -= tx.amount;
    else row.transfers += tx.amount;
  }
  for (const row of byMonth.values()) row.net = row.income - row.expenses;
  return [...byMonth.values()];
}

export interface Totals {
  income: number;
  expenses: number;
  net: number;
  savingsRate: number | null;
}

export function totals(txs: TxRow[], cats: Map<number, CatRow>): Totals {
  let income = 0;
  let expenses = 0;
  for (const tx of txs) {
    const flow = flowOf(tx, cats);
    if (flow === "income") income += tx.amount;
    else if (flow === "expense") expenses -= tx.amount;
  }
  const net = income - expenses;
  return { income, expenses, net, savingsRate: income > 0 ? net / income : null };
}

export interface CategoryTotal {
  categoryId: number | null;
  name: string;
  group: string;
  kind: Flow;
  /** Positive = spent (expense) or received (income) */
  total: number;
  count: number;
}

export function categoryTotals(txs: TxRow[], cats: Map<number, CatRow>, flow: "income" | "expense"): CategoryTotal[] {
  const out = new Map<number | null, CategoryTotal>();
  for (const tx of txs) {
    if (flowOf(tx, cats) !== flow) continue;
    const cat = tx.categoryId != null ? cats.get(tx.categoryId) : undefined;
    const key = cat ? cat.id : null;
    let row = out.get(key);
    if (!row) {
      row = {
        categoryId: key,
        name: cat?.name ?? "Uncategorised",
        group: cat?.groupName ?? "Uncategorised",
        kind: flow,
        total: 0,
        count: 0,
      };
      out.set(key, row);
    }
    row.total += flow === "expense" ? -tx.amount : tx.amount;
    row.count += 1;
  }
  return [...out.values()].sort((a, b) => b.total - a.total);
}

export function groupTotals(rows: CategoryTotal[]): { group: string; total: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.group, (m.get(r.group) ?? 0) + r.total);
  return [...m.entries()].map(([group, total]) => ({ group, total })).sort((a, b) => b.total - a.total);
}

// --- Budgets ---------------------------------------------------------------------

export function monthlyEquivalent(line: Pick<BudgetRow, "amount" | "frequency">): number {
  if (line.frequency === "quarterly") return line.amount / 3;
  if (line.frequency === "yearly") return line.amount / 12;
  return line.amount;
}

export function lineActiveIn(line: Pick<BudgetRow, "startMonth" | "endMonth">, month: string): boolean {
  return (!line.startMonth || month >= line.startMonth) && (!line.endMonth || month <= line.endMonth);
}

export interface BudgetComparison {
  categoryId: number | null;
  name: string;
  group: string;
  kind: Flow;
  budget: number;
  actual: number;
  /** Positive = better than planned (spent less / earned more) */
  difference: number;
  fixed: number;
  variable: number;
  lines: string[];
}

/** Compares planned (monthly equivalents, summed over the months) with actuals per category. */
export function budgetVsActual(
  lines: BudgetRow[],
  txs: TxRow[],
  cats: Map<number, CatRow>,
  months: string[],
): BudgetComparison[] {
  const rows = new Map<number | null, BudgetComparison>();
  const ensure = (categoryId: number | null): BudgetComparison => {
    let row = rows.get(categoryId);
    if (!row) {
      const cat = categoryId != null ? cats.get(categoryId) : undefined;
      row = {
        categoryId,
        name: cat?.name ?? "Unassigned",
        group: cat?.groupName ?? "Unassigned",
        kind: cat?.kind ?? "expense",
        budget: 0,
        actual: 0,
        difference: 0,
        fixed: 0,
        variable: 0,
        lines: [],
      };
      rows.set(categoryId, row);
    }
    return row;
  };

  for (const line of lines) {
    const active = months.filter((m) => lineActiveIn(line, m)).length;
    if (!active) continue;
    const row = ensure(line.categoryId);
    const amount = Math.round(monthlyEquivalent(line) * active);
    row.budget += amount;
    if (line.type === "fixed") row.fixed += amount;
    else row.variable += amount;
    row.lines.push(line.name);
  }

  const monthSet = new Set(months);
  for (const tx of txs) {
    if (!monthSet.has(monthOf(tx.date))) continue;
    const flow = flowOf(tx, cats);
    if (flow === "transfer") continue;
    const row = ensure(tx.categoryId);
    if (tx.categoryId == null) {
      row.name = "Uncategorised";
      row.kind = flow;
    }
    row.actual += row.kind === "income" ? tx.amount : -tx.amount;
  }

  for (const row of rows.values()) {
    row.difference = row.kind === "income" ? row.actual - row.budget : row.budget - row.actual;
  }
  return [...rows.values()].sort((a, b) => b.budget - a.budget || b.actual - a.actual);
}

// --- Year over year ------------------------------------------------------------------

export interface YearRow {
  categoryId: number | null;
  name: string;
  group: string;
  byYear: Record<number, number>;
}

/** Spending per category per calendar year. */
export function spendingByYear(txs: TxRow[], cats: Map<number, CatRow>): { years: number[]; rows: YearRow[] } {
  const years = new Set<number>();
  const rows = new Map<number | null, YearRow>();
  for (const tx of txs) {
    if (flowOf(tx, cats) !== "expense") continue;
    const year = yearOf(tx.date);
    years.add(year);
    const cat = tx.categoryId != null ? cats.get(tx.categoryId) : undefined;
    const key = cat?.id ?? null;
    let row = rows.get(key);
    if (!row) {
      row = { categoryId: key, name: cat?.name ?? "Uncategorised", group: cat?.groupName ?? "Uncategorised", byYear: {} };
      rows.set(key, row);
    }
    row.byYear[year] = (row.byYear[year] ?? 0) - tx.amount;
  }
  return { years: [...years].sort(), rows: [...rows.values()] };
}

/** Spending per month-of-year for each year, for overlaying years in one chart. */
export function monthlySpendingByYear(txs: TxRow[], cats: Map<number, CatRow>): { years: number[]; data: Record<string, number>[] } {
  const years = [...new Set(txs.map((t) => yearOf(t.date)))].sort();
  const data = Array.from({ length: 12 }, (_, i) => ({ month: i + 1 }) as Record<string, number>);
  for (const tx of txs) {
    if (flowOf(tx, cats) !== "expense") continue;
    const m = Number(tx.date.slice(5, 7));
    const key = String(yearOf(tx.date));
    data[m - 1][key] = (data[m - 1][key] ?? 0) - tx.amount;
  }
  return { years, data };
}

export interface CategoryChange {
  categoryId: number | null;
  name: string;
  current: number;
  previous: number;
  change: number;
  changePct: number | null;
}

/** Last 12 months vs the 12 months before, per expense category. */
export function rollingYearChanges(txs: TxRow[], cats: Map<number, CatRow>, lastMonth: string): CategoryChange[] {
  const currentFrom = addMonths(lastMonth, -11);
  const previousFrom = addMonths(lastMonth, -23);
  const previousTo = addMonths(lastMonth, -12);
  const rows = new Map<number | null, CategoryChange>();
  for (const tx of txs) {
    if (flowOf(tx, cats) !== "expense") continue;
    const m = monthOf(tx.date);
    const inCurrent = m >= currentFrom && m <= lastMonth;
    const inPrevious = m >= previousFrom && m <= previousTo;
    if (!inCurrent && !inPrevious) continue;
    const cat = tx.categoryId != null ? cats.get(tx.categoryId) : undefined;
    const key = cat?.id ?? null;
    let row = rows.get(key);
    if (!row) {
      row = { categoryId: key, name: cat?.name ?? "Uncategorised", current: 0, previous: 0, change: 0, changePct: null };
      rows.set(key, row);
    }
    if (inCurrent) row.current -= tx.amount;
    else row.previous -= tx.amount;
  }
  for (const row of rows.values()) {
    row.change = row.current - row.previous;
    row.changePct = row.previous > 0 ? row.change / row.previous : null;
  }
  return [...rows.values()].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

// --- Recurring payments --------------------------------------------------------------

export type Cadence = "monthly" | "quarterly" | "yearly";

export interface RecurringPayment {
  key: string;
  name: string;
  categoryId: number | null;
  cadence: Cadence;
  count: number;
  firstDate: string;
  lastDate: string;
  lastAmount: number;
  averageAmount: number;
  /** Cost per month, positive */
  monthlyCost: number;
  /** Relative change between the first and the last payment */
  priceChange: number | null;
  active: boolean;
}

const CADENCES: { cadence: Cadence; min: number; max: number; days: number; perMonth: number }[] = [
  { cadence: "monthly", min: 25, max: 36, days: 30, perMonth: 1 },
  { cadence: "quarterly", min: 80, max: 100, days: 91, perMonth: 1 / 3 },
  { cadence: "yearly", min: 340, max: 390, days: 365, perMonth: 1 / 12 },
];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Finds subscriptions and other fixed payments: the same payee, at a regular
 * interval, with a stable amount. Uses the latest transaction date as "today".
 */
export function detectRecurring(txs: TxRow[], cats: Map<number, CatRow>): RecurringPayment[] {
  const outgoing = txs.filter((t) => t.amount < 0 && flowOf(t, cats) === "expense");
  if (!outgoing.length) return [];
  const latest = outgoing.reduce((max, t) => (t.date > max ? t.date : max), outgoing[0].date);

  const groups = new Map<string, TxRow[]>();
  for (const tx of outgoing) {
    const key = counterpartyKey(tx);
    const list = groups.get(key);
    if (list) list.push(tx);
    else groups.set(key, [tx]);
  }

  const result: RecurringPayment[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    // Several payments on the same day count once (e.g. split charges).
    const byDay: TxRow[] = [];
    for (const tx of sorted) {
      const last = byDay[byDay.length - 1];
      if (last && last.date === tx.date) byDay[byDay.length - 1] = { ...last, amount: last.amount + tx.amount };
      else byDay.push(tx);
    }
    if (byDay.length < 3) continue;
    const gaps = byDay.slice(1).map((t, i) => daysBetween(byDay[i].date, t.date));
    const typical = median(gaps);
    const spec = CADENCES.find((c) => typical >= c.min && typical <= c.max);
    if (!spec) continue;
    const regular = gaps.filter((g) => g >= spec.min * 0.8 && g <= spec.max * 1.2).length / gaps.length;
    if (regular < 0.7) continue;
    const amounts = byDay.map((t) => -t.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const recent = amounts.slice(-3);
    const spread = Math.max(...recent) - Math.min(...recent);
    if (spread > Math.max(avg * 0.35, 500)) continue; // too variable to be a fixed payment

    const last = byDay[byDay.length - 1];
    const first = byDay[0];
    const lastAmount = -last.amount;
    const firstAmount = -first.amount;
    result.push({
      key,
      name: last.counterpartyName || last.description.slice(0, 40) || "Unknown",
      categoryId: last.categoryId,
      cadence: spec.cadence,
      count: byDay.length,
      firstDate: first.date,
      lastDate: last.date,
      lastAmount,
      averageAmount: Math.round(avg),
      monthlyCost: Math.round(lastAmount * spec.perMonth),
      priceChange: firstAmount > 0 ? (lastAmount - firstAmount) / firstAmount : null,
      active: daysBetween(last.date, latest) <= spec.days * 1.6,
    });
  }
  return result.sort((a, b) => Number(b.active) - Number(a.active) || b.monthlyCost - a.monthlyCost);
}

// --- Counterparties & balance ----------------------------------------------------

export function topCounterparties(txs: TxRow[], cats: Map<number, CatRow>, limit = 10) {
  const m = new Map<string, { name: string; total: number; count: number }>();
  for (const tx of txs) {
    if (flowOf(tx, cats) !== "expense") continue;
    const key = counterpartyKey(tx);
    const row = m.get(key) ?? { name: tx.counterpartyName || tx.description.slice(0, 40) || "Unknown", total: 0, count: 0 };
    row.total -= tx.amount;
    row.count += 1;
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

/** Month-end balance, from the opening balance plus all transactions. */
export function balanceByMonth(txs: TxRow[], openingBalance: number, months: string[]): { month: string; balance: number }[] {
  if (!months.length) return [];
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1));
  let balance = openingBalance;
  let i = 0;
  const out: { month: string; balance: number }[] = [];
  for (const month of months) {
    while (i < sorted.length && monthOf(sorted[i].date) <= month) balance += sorted[i++].amount;
    out.push({ month, balance });
  }
  return out;
}

export function monthRange(txs: { date: string }[]): { first: string; last: string } | null {
  if (!txs.length) return null;
  let first = txs[0].date;
  let last = txs[0].date;
  for (const t of txs) {
    if (t.date < first) first = t.date;
    if (t.date > last) last = t.date;
  }
  return { first: monthOf(first), last: monthOf(last) };
}

export { monthsBetween };
