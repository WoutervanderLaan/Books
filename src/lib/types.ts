// Shared domain types and constants. Safe to import from client components.

export const ACCOUNT_KINDS = ["personal", "business"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const CATEGORY_KINDS = ["income", "expense", "transfer"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CATEGORY_SCOPES = ["personal", "business", "both"] as const;
export type CategoryScope = (typeof CATEGORY_SCOPES)[number];

/**
 * Special handling for a category, beyond its kind.
 * - internal_transfer: money moving between your own accounts
 * - savings: transfer to savings/investments (personal)
 * - private: owner's draw / private deposit between business and personal
 * - vat: VAT (BTW) payments to or refunds from the tax office
 * - income_tax: income tax / Zvw payments (provisional assessments)
 * - asset: purchase of a business asset that is depreciated instead of expensed
 */
export const CATEGORY_ROLES = [
  "internal_transfer",
  "savings",
  "private",
  "vat",
  "income_tax",
  "asset",
] as const;
export type CategoryRole = (typeof CATEGORY_ROLES)[number];

/**
 * VAT treatment of a business transaction (Dutch BTW).
 * - high / low: amount includes 21% / 9% VAT
 * - zero: 0% rate (still reported, rubriek 1e for sales)
 * - exempt: VAT-exempt (insurance, bank fees, ...)
 * - eu: reverse-charged within the EU (purchases: 4b, sales: 3b)
 * - non_eu: services from outside the EU (purchases: 4a)
 * - none: outside the scope of VAT (private, transfers, taxes)
 */
export const VAT_CODES = ["high", "low", "zero", "exempt", "eu", "non_eu", "none"] as const;
export type VatCode = (typeof VAT_CODES)[number];

export const VAT_CODE_LABELS: Record<VatCode, string> = {
  high: "21% (high)",
  low: "9% (low)",
  zero: "0%",
  exempt: "Exempt",
  eu: "EU reverse charge",
  non_eu: "Outside EU",
  none: "No VAT",
};

/** Profit & loss grouping, mirroring the sections of the Dutch income tax return. */
export const TAX_GROUPS = [
  "revenue",
  "other_income",
  "purchase",
  "personnel",
  "car",
  "housing",
  "sales",
  "other",
] as const;
export type TaxGroup = (typeof TAX_GROUPS)[number];

export const TAX_GROUP_LABELS: Record<TaxGroup, string> = {
  revenue: "Revenue (omzet)",
  other_income: "Other business income",
  purchase: "Cost of sales (inkoopkosten)",
  personnel: "Personnel costs",
  car: "Car & transport costs",
  housing: "Housing costs (huisvesting)",
  sales: "Sales & representation (verkoopkosten)",
  other: "Other costs (andere kosten)",
};

export const BUDGET_FREQUENCIES = ["monthly", "quarterly", "yearly"] as const;
export type BudgetFrequency = (typeof BUDGET_FREQUENCIES)[number];

export const BUDGET_TYPES = ["fixed", "variable"] as const;
export type BudgetType = (typeof BUDGET_TYPES)[number];

export const CATEGORY_SOURCES = ["manual", "rule", "transfer"] as const;
export type CategorySource = (typeof CATEGORY_SOURCES)[number];

export const RULE_SOURCES = ["user", "auto", "starter"] as const;
export type RuleSource = (typeof RULE_SOURCES)[number];

export const DIRECTIONS = ["in", "out"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Column mapping for CSV files that don't match a built-in bank format. */
export interface CsvMapping {
  /** Header row joined with "|" — used to recognise the same layout next month. */
  signature: string;
  delimiter: string;
  hasHeader: boolean;
  date: number;
  dateFormat: DateFormat;
  amount: number;
  amountMode: "signed" | "indicator" | "split";
  /** amountMode "indicator": column with debit/credit marker */
  indicator?: number;
  /** amountMode "indicator": comma separated values meaning money going out */
  debitValues?: string;
  /** amountMode "split": separate column with debit amounts (amount column = credits) */
  debit?: number;
  decimal: "," | ".";
  counterpartyName?: number;
  counterpartyIban?: number;
  description: number[];
  externalId?: number;
  balance?: number;
}

export const DATE_FORMATS = [
  "YYYY-MM-DD",
  "DD-MM-YYYY",
  "YYYYMMDD",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "DD.MM.YYYY",
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
