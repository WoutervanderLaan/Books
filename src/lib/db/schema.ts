import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  ACCOUNT_KINDS,
  BUDGET_FREQUENCIES,
  BUDGET_TYPES,
  CATEGORY_KINDS,
  CATEGORY_ROLES,
  CATEGORY_SCOPES,
  CATEGORY_SOURCES,
  DIRECTIONS,
  RULE_SOURCES,
  TAX_GROUPS,
  VAT_CODES,
  type CsvMapping,
} from "../types";

// All money amounts are stored as integer cents. Dates are ISO strings (YYYY-MM-DD).

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`);

/** Small key/value store for app level state (e.g. seeding version). */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ACCOUNT_KINDS }).notNull(),
  iban: text("iban"),
  description: text("description"),
  /** Balance before the first transaction known to the app. */
  openingBalance: integer("opening_balance").notNull().default(0),
  /** Whether the opening balance is derived from bank statement balances. */
  autoBalance: integer("auto_balance", { mode: "boolean" }).notNull().default(true),
  /** Business only: registered for the small business VAT scheme (KOR). */
  vatKor: integer("vat_kor", { mode: "boolean" }).notNull().default(false),
  /** Personal only: a savings account; its balance change counts as "put aside" in the combined view. */
  isSavings: integer("is_savings", { mode: "boolean" }).notNull().default(false),
  csvMapping: text("csv_mapping", { mode: "json" }).$type<CsvMapping>(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  groupName: text("group_name").notNull(),
  kind: text("kind", { enum: CATEGORY_KINDS }).notNull(),
  scope: text("scope", { enum: CATEGORY_SCOPES }).notNull(),
  role: text("role", { enum: CATEGORY_ROLES }),
  /** Business: default VAT treatment for transactions in this category. */
  vatCode: text("vat_code", { enum: VAT_CODES }),
  /** Business: section of the profit & loss statement. */
  taxGroup: text("tax_group", { enum: TAX_GROUPS }),
  /** Business: share of the cost that is deductible for income tax. */
  deductiblePct: integer("deductible_pct").notNull().default(100),
  sortOrder: integer("sort_order").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

export const imports = sqliteTable("imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  format: text("format").notNull(),
  totalRows: integer("total_rows").notNull(),
  insertedRows: integer("inserted_rows").notNull(),
  duplicateRows: integer("duplicate_rows").notNull(),
  categorizedRows: integer("categorized_rows").notNull(),
  dateFrom: text("date_from"),
  dateTo: text("date_to"),
  importedAt: createdAt(),
});

export const rules = sqliteTable(
  "rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Applies to one account; when null it applies to all accounts of `accountKind` (or all). */
    accountId: integer("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    accountKind: text("account_kind", { enum: ACCOUNT_KINDS }),
    counterpartyContains: text("counterparty_contains"),
    descriptionContains: text("description_contains"),
    counterpartyIban: text("counterparty_iban"),
    direction: text("direction", { enum: DIRECTIONS }),
    amountMin: integer("amount_min"),
    amountMax: integer("amount_max"),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    vatCode: text("vat_code", { enum: VAT_CODES }),
    priority: integer("priority").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    source: text("source", { enum: RULE_SOURCES }).notNull().default("user"),
    timesApplied: integer("times_applied").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("rules_account_idx").on(t.accountId)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    /** Signed cents: negative = money out. */
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("EUR"),
    counterpartyName: text("counterparty_name"),
    counterpartyIban: text("counterparty_iban"),
    description: text("description").notNull().default(""),
    txType: text("tx_type"),
    externalId: text("external_id"),
    dedupeKey: text("dedupe_key").notNull(),
    balanceAfter: integer("balance_after"),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    categorySource: text("category_source", { enum: CATEGORY_SOURCES }),
    ruleId: integer("rule_id").references(() => rules.id, { onDelete: "set null" }),
    /** Business: overrides the category's VAT code. */
    vatCode: text("vat_code", { enum: VAT_CODES }),
    /** Business: exact VAT amount in cents (overrides the calculated amount). */
    vatAmount: integer("vat_amount"),
    /** Business: invoice date when it differs from the payment date (VAT/tax period). */
    taxDate: text("tax_date"),
    note: text("note"),
    importId: integer("import_id").references(() => imports.id, { onDelete: "set null" }),
    isManual: integer("is_manual", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("transactions_dedupe_idx").on(t.accountId, t.dedupeKey),
    index("transactions_account_date_idx").on(t.accountId, t.date),
    index("transactions_category_idx").on(t.categoryId),
  ],
);

export const budgetLines = sqliteTable(
  "budget_lines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    /** Positive cents per period. */
    amount: integer("amount").notNull(),
    frequency: text("frequency", { enum: BUDGET_FREQUENCIES }).notNull().default("monthly"),
    type: text("type", { enum: BUDGET_TYPES }).notNull().default("fixed"),
    /** YYYY-MM, inclusive. Null = open ended. */
    startMonth: text("start_month"),
    endMonth: text("end_month"),
    note: text("note"),
  },
  (t) => [index("budget_account_idx").on(t.accountId)],
);

export const taxYears = sqliteTable(
  "tax_years",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    /** Eligible for startersaftrek this year. */
    isStarter: integer("is_starter", { mode: "boolean" }).notNull().default(false),
    /** "auto" uses the hours log; "yes"/"no" overrides it. */
    hoursCriterion: text("hours_criterion", { enum: ["auto", "yes", "no"] })
      .notNull()
      .default("auto"),
    /** Other box 1 income (e.g. salary), cents. */
    otherIncome: integer("other_income").notNull().default(0),
    /** Income tax already paid outside this account (provisional assessments), cents. */
    prepaidTax: integer("prepaid_tax").notNull().default(0),
    /** Overrides for built-in tax parameters for this year. */
    params: text("params", { mode: "json" }).$type<Record<string, unknown>>(),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("tax_years_account_year_idx").on(t.accountId, t.year)],
);

export const hoursEntries = sqliteTable(
  "hours_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    hours: real("hours").notNull(),
    description: text("description"),
  },
  (t) => [index("hours_account_date_idx").on(t.accountId, t.date)],
);

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  purchaseDate: text("purchase_date").notNull(),
  /** Purchase price excluding deductible VAT, cents. */
  cost: integer("cost").notNull(),
  residualValue: integer("residual_value").notNull().default(0),
  usefulLifeYears: integer("useful_life_years").notNull().default(5),
  kiaEligible: integer("kia_eligible", { mode: "boolean" }).notNull().default(true),
  disposedDate: text("disposed_date"),
  note: text("note"),
});

export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;
export type BudgetLine = typeof budgetLines.$inferSelect;
export type ImportRecord = typeof imports.$inferSelect;
export type TaxYear = typeof taxYears.$inferSelect;
export type HoursEntry = typeof hoursEntries.$inferSelect;
export type Asset = typeof assets.$inferSelect;
