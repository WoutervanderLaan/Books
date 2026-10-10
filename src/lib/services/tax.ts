import { and, asc, eq, sql } from "drizzle-orm";
import type { DB } from "../db/connection";
import { assets, categories, hoursEntries, taxYears, transactions, type Account, type Asset, type TaxYear } from "../db/schema";
import { daysBetween, todayIso, yearOf } from "../dates";
import {
  bookValueAtEndOf,
  depreciationForYear,
  estimateIncomeTax,
  kiaAmount,
  profitAndLoss,
  qualifyingInvestments,
  type IncomeTaxEstimate,
  type Pnl,
  type PnlTx,
} from "../tax/income-tax";
import { resolveParams, type NlTaxParams } from "../tax/params";
import { taxDateOf, vatReturn, type VatReturn } from "../tax/vat";

export function getTaxYear(db: DB, accountId: number, year: number): TaxYear {
  const existing = db
    .select()
    .from(taxYears)
    .where(and(eq(taxYears.accountId, accountId), eq(taxYears.year, year)))
    .get();
  if (existing) return existing;
  return db.insert(taxYears).values({ accountId, year }).returning().get();
}

export function updateTaxYear(
  db: DB,
  id: number,
  patch: Partial<Pick<TaxYear, "isStarter" | "hoursCriterion" | "otherIncome" | "prepaidTax" | "params" | "notes">>,
) {
  db.update(taxYears).set(patch).where(eq(taxYears.id, id)).run();
}

// --- Hours ---------------------------------------------------------------------------

export function listHours(db: DB, accountId: number, year: number) {
  return db
    .select()
    .from(hoursEntries)
    .where(and(eq(hoursEntries.accountId, accountId), sql`substr(${hoursEntries.date}, 1, 4) = ${String(year)}`))
    .orderBy(asc(hoursEntries.date))
    .all();
}

export function addHours(db: DB, accountId: number, date: string, hours: number, description: string | null) {
  db.insert(hoursEntries).values({ accountId, date, hours, description }).run();
}

export function deleteHours(db: DB, id: number) {
  db.delete(hoursEntries).where(eq(hoursEntries.id, id)).run();
}

// --- Assets --------------------------------------------------------------------------

export function listAssets(db: DB, accountId: number): Asset[] {
  return db.select().from(assets).where(eq(assets.accountId, accountId)).orderBy(asc(assets.purchaseDate)).all();
}

export type AssetInput = Omit<Asset, "id" | "accountId">;

export function saveAsset(db: DB, accountId: number, input: AssetInput, id?: number) {
  if (id) db.update(assets).set(input).where(eq(assets.id, id)).run();
  else db.insert(assets).values({ ...input, accountId }).run();
}

export function deleteAsset(db: DB, id: number) {
  db.delete(assets).where(eq(assets.id, id)).run();
}

// --- Overview ------------------------------------------------------------------------

export function businessTransactions(db: DB, accountId: number): PnlTx[] {
  return db
    .select({
      date: transactions.date,
      taxDate: transactions.taxDate,
      amount: transactions.amount,
      vatCode: transactions.vatCode,
      vatAmount: transactions.vatAmount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryKind: categories.kind,
      categoryRole: categories.role,
      categoryVatCode: categories.vatCode,
      categoryTaxGroup: categories.taxGroup,
      deductiblePct: sql<number>`coalesce(${categories.deductiblePct}, 100)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.accountId, accountId))
    .all();
}

export interface AssetSchedule {
  asset: Asset;
  depreciation: number;
  bookValue: number;
}

export interface TaxOverview {
  year: number;
  taxYear: TaxYear;
  params: NlTaxParams;
  pnl: Pnl;
  assets: AssetSchedule[];
  kiaBase: number;
  kia: number;
  hours: number;
  /** Hours extrapolated to the full year (current year only) */
  hoursProjected: number | null;
  hoursCriterionMet: boolean;
  /** True when the year is still running: figures are "so far" */
  partialYear: boolean;
  estimate: IncomeTaxEstimate;
  vat: VatReturn[];
  vatPaid: number;
  incomeTaxPaid: number;
  /** Positive = still to pay */
  incomeTaxRemaining: number;
  privateWithdrawals: number;
  privateDeposits: number;
  availableYears: number[];
}

export function taxOverview(db: DB, account: Account, year: number): TaxOverview {
  const taxYear = getTaxYear(db, account.id, year);
  const params = resolveParams(year, taxYear.params);
  const txs = businessTransactions(db, account.id);
  const minAsset = Math.round(params.minAssetValue * 100);

  const assetList = listAssets(db, account.id);
  const schedule = assetList.map((asset) => ({
    asset,
    depreciation: depreciationForYear(asset, year, minAsset),
    bookValue: bookValueAtEndOf(asset, year, minAsset),
  }));
  const depreciation = schedule.reduce((s, a) => s + a.depreciation, 0);
  const kiaBase = qualifyingInvestments(assetList, year, params).reduce((s, a) => s + a.cost, 0);
  const kia = kiaAmount(kiaBase, params);

  const pnl = profitAndLoss(txs, year, params, account.vatKor, depreciation);
  const hours = listHours(db, account.id, year).reduce((s, h) => s + h.hours, 0);
  const today = todayIso();
  const partialYear = today >= `${year}-01-01` && today <= `${year}-12-31`;
  const elapsed = partialYear ? (daysBetween(`${year}-01-01`, today) + 1) / 365 : 1;
  const hoursProjected = partialYear && elapsed > 0.1 ? Math.round(hours / elapsed) : null;
  // For the running year, being on track counts so the estimate reflects the full year.
  const hoursCriterionMet =
    taxYear.hoursCriterion === "yes" ||
    (taxYear.hoursCriterion === "auto" && (hours >= params.urencriterium || (hoursProjected ?? 0) >= params.urencriterium));

  const estimate = estimateIncomeTax({
    profit: pnl.profit,
    kia,
    hoursCriterionMet,
    isStarter: taxYear.isStarter,
    otherIncome: taxYear.otherIncome,
    params,
  });

  const inYear = txs.filter((t) => yearOf(taxDateOf(t)) === year);
  const sumRole = (role: string, pred: (amount: number) => boolean = () => true) =>
    inYear.filter((t) => t.categoryRole === role && pred(t.amount)).reduce((s, t) => s + t.amount, 0);
  const incomeTaxPaid = -sumRole("income_tax") + taxYear.prepaidTax;

  const years = new Set(txs.map((t) => yearOf(taxDateOf(t))));
  years.add(year);

  return {
    year,
    taxYear,
    params,
    pnl,
    assets: schedule,
    kiaBase,
    kia,
    hours,
    hoursProjected,
    hoursCriterionMet,
    partialYear,
    estimate,
    vat: account.vatKor ? [] : [1, 2, 3, 4].map((q) => vatReturn(txs, year, q, params)),
    vatPaid: -sumRole("vat"),
    incomeTaxPaid,
    incomeTaxRemaining: estimate.total - incomeTaxPaid,
    privateWithdrawals: -sumRole("private", (a) => a < 0),
    privateDeposits: sumRole("private", (a) => a > 0),
    availableYears: [...years].sort((a, b) => b - a),
  };
}
