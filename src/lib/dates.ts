// Month keys are "YYYY-MM"; dates are "YYYY-MM-DD". All calendar math is UTC-free string math.

export const monthOf = (date: string) => date.slice(0, 7);
export const yearOf = (dateOrMonth: string) => Number(dateOrMonth.slice(0, 4));

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Inclusive list of months from `from` to `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function quarterOf(dateOrMonth: string): number {
  return Math.floor((Number(dateOrMonth.slice(5, 7)) - 1) / 3) + 1;
}

export function quarterMonths(year: number, quarter: number): string[] {
  const start = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}`;
  return monthsBetween(start, addMonths(start, 2));
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const currentMonth = () => monthOf(todayIso());

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMonth(month: string, opts: { short?: boolean } = {}): string {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1];
  return opts.short ? name : `${name} ${month.slice(0, 4)}`;
}

export function formatDate(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

export const monthName = (m: number) => MONTH_NAMES[m - 1];
