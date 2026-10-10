// Money is stored in integer cents and shown in Dutch notation (€ 1.234,56).
export const LOCALE = "nl-NL";

const currency = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" });
const currencyWhole = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});
const number = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

export function formatMoney(cents: number, opts: { whole?: boolean; sign?: boolean } = {}): string {
  const value = cents / 100;
  const text = (opts.whole ? currencyWhole : currency).format(value);
  return opts.sign && cents > 0 ? `+${text}` : text;
}

/** Compact axis labels: €1,2k, €15k, €1,1M */
export function formatMoneyCompact(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `€${number.format(v / 1_000_000)}M`;
  if (abs >= 1_000) return `€${number.format(v / 1_000)}k`;
  return `€${Math.round(v)}`;
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}

export function formatNumber(n: number, digits = 1): string {
  return n.toLocaleString(LOCALE, { maximumFractionDigits: digits });
}

/** Parses user input like "1.234,56" or "1234.56" into cents. */
export function parseMoneyInput(input: string): number | null {
  const s = input.trim().replace(/[€\s]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized = s;
  if (lastComma > lastDot) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) normalized = s.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}
