import { monthOf, yearOf } from "../dates";
import type { CategoryKind, CategoryRole, TaxGroup, VatCode } from "../types";
import type { NlTaxParams, Segment } from "./params";
import { effectiveVatCode, splitVat, taxDateOf } from "./vat";

const toCents = (euros: number) => Math.round(euros * 100);
const toEuros = (cents: number) => cents / 100;

/** Sum of rate × (part of x inside each segment). */
export function piecewise(x: number, segments: Segment[]): number {
  let previous = 0;
  let total = 0;
  for (const s of segments) {
    const top = s.upTo ?? Infinity;
    if (x > previous) total += (Math.min(x, top) - previous) * s.rate;
    previous = top;
    if (x <= top) break;
  }
  return total;
}

// --- Assets ---------------------------------------------------------------------------

export interface AssetLike {
  id: number;
  name: string;
  purchaseDate: string;
  cost: number;
  residualValue: number;
  usefulLifeYears: number;
  kiaEligible: boolean;
  disposedDate: string | null;
}

/** Straight-line depreciation for one calendar year, pro rata per month from the purchase month. */
export function depreciationForYear(asset: AssetLike, year: number, minAssetValueCents: number): number {
  const purchaseYear = yearOf(asset.purchaseDate);
  if (year < purchaseYear) return 0;
  if (asset.cost < minAssetValueCents) return year === purchaseYear ? asset.cost : 0;
  const depreciable = Math.max(0, asset.cost - asset.residualValue);
  const totalMonths = Math.max(1, asset.usefulLifeYears * 12);
  const perMonth = depreciable / totalMonths;

  const startIndex = purchaseYear * 12 + Number(asset.purchaseDate.slice(5, 7)) - 1;
  const endIndex = asset.disposedDate
    ? yearOf(asset.disposedDate) * 12 + Number(monthOf(asset.disposedDate).slice(5, 7)) - 1
    : Infinity;
  const yearStart = year * 12;
  const yearEnd = year * 12 + 11;
  const lastDepMonth = Math.min(startIndex + totalMonths - 1, endIndex, yearEnd);
  const firstDepMonth = Math.max(startIndex, yearStart);
  const months = Math.max(0, lastDepMonth - firstDepMonth + 1);
  // Round per year against the cumulative total so the schedule adds up exactly.
  const before = Math.max(0, Math.min(firstDepMonth, startIndex + totalMonths) - startIndex);
  return Math.round(perMonth * (before + months)) - Math.round(perMonth * before);
}

export function bookValueAtEndOf(asset: AssetLike, year: number, minAssetValueCents: number): number {
  let value = asset.cost;
  for (let y = yearOf(asset.purchaseDate); y <= year; y++) value -= depreciationForYear(asset, y, minAssetValueCents);
  return value;
}

/** Kleinschaligheidsinvesteringsaftrek for the total qualifying investment of a year. */
export function kiaAmount(totalInvestmentCents: number, p: NlTaxParams): number {
  const total = toEuros(totalInvestmentCents);
  const k = p.kia;
  let euros = 0;
  if (total < k.minTotal) euros = 0;
  else if (total <= k.pctUpTo) euros = total * k.pct;
  else if (total <= k.fixedUpTo) euros = k.fixed;
  else if (total < k.zeroFrom) euros = Math.max(0, k.fixed - (total - k.fixedUpTo) * k.decreaseRate);
  return toCents(euros);
}

export function qualifyingInvestments(assets: AssetLike[], year: number, p: NlTaxParams): AssetLike[] {
  return assets.filter(
    (a) => a.kiaEligible && yearOf(a.purchaseDate) === year && a.cost >= toCents(p.minAssetValue),
  );
}

// --- Profit & loss --------------------------------------------------------------------

export interface PnlTx {
  date: string;
  taxDate: string | null;
  amount: number;
  vatCode: VatCode | null;
  vatAmount: number | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryKind: CategoryKind | null;
  categoryRole: CategoryRole | null;
  categoryVatCode: VatCode | null;
  categoryTaxGroup: TaxGroup | null;
  deductiblePct: number;
}

export interface PnlLine {
  categoryId: number;
  name: string;
  /** Excluding reclaimable VAT */
  amount: number;
  deductible: number;
  count: number;
}

export interface PnlGroup {
  group: TaxGroup;
  lines: PnlLine[];
  total: number;
}

export interface Pnl {
  year: number;
  income: PnlGroup[];
  costs: PnlGroup[];
  totalIncome: number;
  /** Deductible costs, before depreciation */
  totalCosts: number;
  nonDeductible: number;
  depreciation: number;
  profit: number;
  uncategorised: { count: number; amount: number };
}

/** Profit and loss for a calendar year, amounts excluding VAT (unless KOR applies). */
export function profitAndLoss(
  txs: PnlTx[],
  year: number,
  rates: { vatHigh: number; vatLow: number },
  kor: boolean,
  depreciation: number,
): Pnl {
  const income = new Map<TaxGroup, Map<number, PnlLine>>();
  const costs = new Map<TaxGroup, Map<number, PnlLine>>();
  const uncategorised = { count: 0, amount: 0 };
  let nonDeductible = 0;

  for (const tx of txs) {
    if (yearOf(taxDateOf(tx)) !== year) continue;
    if (tx.categoryId == null || tx.categoryKind == null) {
      uncategorised.count++;
      uncategorised.amount += tx.amount;
      continue;
    }
    if (tx.categoryKind === "transfer" || tx.categoryRole === "asset") continue;
    const isIncome = tx.categoryKind === "income";
    const gross = isIncome ? tx.amount : -tx.amount;
    const { base } = splitVat(gross, effectiveVatCode(tx), rates, tx.vatAmount, kor);
    const group: TaxGroup = tx.categoryTaxGroup ?? (isIncome ? "other_income" : "other");
    const target = isIncome ? income : costs;
    const lines = target.get(group) ?? new Map<number, PnlLine>();
    target.set(group, lines);
    const line = lines.get(tx.categoryId) ?? {
      categoryId: tx.categoryId,
      name: tx.categoryName ?? "",
      amount: 0,
      deductible: 0,
      count: 0,
    };
    line.amount += base;
    const deductible = isIncome ? base : Math.round((base * tx.deductiblePct) / 100);
    line.deductible += deductible;
    if (!isIncome) nonDeductible += base - deductible;
    line.count++;
    lines.set(tx.categoryId, line);
  }

  const toGroups = (m: Map<TaxGroup, Map<number, PnlLine>>, field: "amount" | "deductible"): PnlGroup[] =>
    [...m.entries()].map(([group, lines]) => {
      const list = [...lines.values()].sort((a, b) => b.amount - a.amount);
      return { group, lines: list, total: list.reduce((s, l) => s + l[field], 0) };
    });

  const incomeGroups = toGroups(income, "amount");
  const costGroups = toGroups(costs, "deductible");
  const totalIncome = incomeGroups.reduce((s, g) => s + g.total, 0);
  const totalCosts = costGroups.reduce((s, g) => s + g.total, 0);
  return {
    year,
    income: incomeGroups,
    costs: costGroups,
    totalIncome,
    totalCosts,
    nonDeductible,
    depreciation,
    profit: totalIncome - totalCosts - depreciation,
    uncategorised,
  };
}

// --- Income tax estimate ----------------------------------------------------------------

export interface IncomeTaxInput {
  /** Profit from the P&L (after depreciation), cents */
  profit: number;
  /** KIA, cents */
  kia: number;
  hoursCriterionMet: boolean;
  isStarter: boolean;
  /** Other box 1 income such as salary, cents */
  otherIncome: number;
  params: NlTaxParams;
}

export interface IncomeTaxEstimate {
  profit: number;
  kia: number;
  fiscalProfit: number;
  zelfstandigenaftrek: number;
  startersaftrek: number;
  profitAfterDeductions: number;
  mkbVrijstelling: number;
  taxableProfit: number;
  otherIncome: number;
  box1Income: number;
  box1Gross: number;
  generalCredit: number;
  labourCredit: number;
  box1Tax: number;
  /** Tax on other income alone (roughly what an employer already withholds) */
  box1TaxWithoutBusiness: number;
  /** Extra income tax caused by the business profit */
  businessIncomeTax: number;
  zvw: number;
  /** businessIncomeTax + zvw */
  total: number;
  /** total / profit */
  effectiveRate: number | null;
}

function box1(incomeEuros: number, labourIncomeEuros: number, p: NlTaxParams) {
  const gross = piecewise(Math.max(0, incomeEuros), p.box1);
  const ahk = p.algemeneHeffingskorting;
  const general = Math.min(ahk.max, Math.max(0, ahk.max - Math.max(0, incomeEuros - ahk.phaseOutFrom) * ahk.phaseOutRate));
  const labour = Math.max(0, piecewise(Math.max(0, labourIncomeEuros), p.arbeidskorting));
  const credits = Math.min(gross, general + labour);
  const generalUsed = Math.min(general, gross);
  return { gross, general: generalUsed, labour: credits - generalUsed, tax: gross - credits };
}

/**
 * Indicative income tax for a Dutch sole proprietor (IB-ondernemer) below AOW age.
 * Ignores box 2/3, deductions like mortgage interest, fiscal partner allocation,
 * and loss carry-forward. Good enough to know how much to set aside.
 */
export function estimateIncomeTax(input: IncomeTaxInput): IncomeTaxEstimate {
  const p = input.params;
  const profit = toEuros(input.profit);
  const kia = toEuros(input.kia);
  const fiscalProfit = profit - kia;

  let zelfstandigenaftrek = 0;
  let startersaftrek = 0;
  if (input.hoursCriterionMet) {
    zelfstandigenaftrek = input.isStarter ? p.zelfstandigenaftrek : Math.min(p.zelfstandigenaftrek, Math.max(0, fiscalProfit));
    startersaftrek = input.isStarter ? p.startersaftrek : 0;
  }
  const profitAfterDeductions = fiscalProfit - zelfstandigenaftrek - startersaftrek;
  const mkb = profitAfterDeductions * p.mkbWinstvrijstelling;
  const taxableProfit = profitAfterDeductions - mkb;
  const other = toEuros(input.otherIncome);
  const box1Income = taxableProfit + other;

  const withBusiness = box1(box1Income, Math.max(0, taxableProfit) + other, p);
  const withoutBusiness = box1(other, other, p);
  const businessIncomeTax = withBusiness.tax - withoutBusiness.tax;
  const zvw = Math.min(Math.max(0, taxableProfit), p.zvwMaxIncome) * p.zvwRate;
  const total = businessIncomeTax + zvw;

  return {
    profit: input.profit,
    kia: input.kia,
    fiscalProfit: toCents(fiscalProfit),
    zelfstandigenaftrek: toCents(zelfstandigenaftrek),
    startersaftrek: toCents(startersaftrek),
    profitAfterDeductions: toCents(profitAfterDeductions),
    mkbVrijstelling: toCents(mkb),
    taxableProfit: toCents(taxableProfit),
    otherIncome: input.otherIncome,
    box1Income: toCents(box1Income),
    box1Gross: toCents(withBusiness.gross),
    generalCredit: toCents(withBusiness.general),
    labourCredit: toCents(withBusiness.labour),
    box1Tax: toCents(withBusiness.tax),
    box1TaxWithoutBusiness: toCents(withoutBusiness.tax),
    businessIncomeTax: toCents(businessIncomeTax),
    zvw: toCents(zvw),
    total: toCents(total),
    effectiveRate: profit > 0 ? total / profit : null,
  };
}
