import { currentMonth, yearOf } from "../dates";

export function yearFromParams(sp: Record<string, string | string[] | undefined>): number {
  const raw = typeof sp.year === "string" ? Number(sp.year) : NaN;
  return Number.isInteger(raw) && raw > 1990 && raw < 2200 ? raw : yearOf(currentMonth());
}

export function yearOptions(available: number[], selected: number): number[] {
  const set = new Set([...available, selected, yearOf(currentMonth())]);
  return [...set].sort((a, b) => b - a);
}

/** Dutch VAT return deadline: the last day of the month after the quarter. */
export function vatDeadline(year: number, quarter: number): string {
  const month = quarter * 3 + 1;
  const y = month > 12 ? year + 1 : year;
  const m = month > 12 ? 1 : month;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${last}`;
}
