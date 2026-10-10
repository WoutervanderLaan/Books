import { quarterOf, yearOf } from "../dates";
import type { CategoryKind, CategoryRole, VatCode } from "../types";

export interface VatRates {
  vatHigh: number;
  vatLow: number;
}

export interface VatSplit {
  /** Amount paid/received, positive for normal sales and purchases (negative for refunds) */
  gross: number;
  /** Amount excluding VAT */
  base: number;
  /** VAT included in (or, for reverse charge, due on top of) the amount */
  vat: number;
}

/**
 * Splits a transaction amount into base and VAT.
 * `gross` is sign-adjusted: positive = a normal sale (for income) or purchase (for expenses).
 */
export function splitVat(gross: number, code: VatCode, rates: VatRates, override?: number | null, kor = false): VatSplit {
  if (kor) return { gross, base: gross, vat: 0 };
  const sign = gross < 0 ? -1 : 1;
  if (code === "high" || code === "low") {
    const rate = code === "high" ? rates.vatHigh : rates.vatLow;
    const vat = override != null ? sign * Math.abs(override) : Math.round((gross * rate) / (100 + rate));
    return { gross, base: gross - vat, vat };
  }
  if (code === "eu" || code === "non_eu") {
    // Reverse charge: the amount paid excludes VAT; you declare and deduct it yourself.
    const vat = override != null ? sign * Math.abs(override) : Math.round((gross * rates.vatHigh) / 100);
    return { gross, base: gross, vat };
  }
  return { gross, base: gross, vat: 0 };
}

export interface VatTx {
  date: string;
  taxDate: string | null;
  amount: number;
  vatCode: VatCode | null;
  vatAmount: number | null;
  categoryKind: CategoryKind | null;
  categoryRole: CategoryRole | null;
  categoryVatCode: VatCode | null;
}

export type VatSide = "sales" | "purchases";

/** Which side of the VAT return a transaction belongs to, if any. */
export function vatSide(tx: Pick<VatTx, "categoryKind">): VatSide | null {
  if (tx.categoryKind === "income") return "sales";
  if (tx.categoryKind === "expense") return "purchases";
  return null;
}

export const effectiveVatCode = (tx: Pick<VatTx, "vatCode" | "categoryVatCode">): VatCode =>
  tx.vatCode ?? tx.categoryVatCode ?? "none";

export const taxDateOf = (tx: { date: string; taxDate: string | null }) => tx.taxDate ?? tx.date;

export interface VatBox {
  code: string;
  label: string;
  base: number;
  vat: number;
}

export interface VatReturn {
  year: number;
  quarter: number;
  boxes: VatBox[];
  /** 5a: VAT due */
  due: number;
  /** 5b: input VAT (voorbelasting) */
  deductible: number;
  /** Positive = to pay, negative = to reclaim */
  balance: number;
  /** Informational: sales not on the return (outside the EU, exempt) */
  notReported: number;
  transactionCount: number;
  uncategorised: number;
}

const BOXES: [code: string, label: string][] = [
  ["1a", "Supplies/services taxed at high rate (21%)"],
  ["1b", "Supplies/services taxed at low rate (9%)"],
  ["1e", "Supplies/services taxed at 0% or not taxed at you"],
  ["3b", "Supplies/services to EU countries (intra-community)"],
  ["4a", "Services from outside the EU"],
  ["4b", "Supplies/services from EU countries"],
  ["5b", "Input VAT (voorbelasting)"],
];

/** Builds the quarterly Dutch VAT return (aangifte omzetbelasting) from categorised transactions. */
export function vatReturn(txs: VatTx[], year: number, quarter: number, rates: VatRates): VatReturn {
  const boxes = new Map(BOXES.map(([code, label]) => [code, { code, label, base: 0, vat: 0 }]));
  const add = (code: string, base: number, vat: number) => {
    const box = boxes.get(code)!;
    box.base += base;
    box.vat += vat;
  };
  let notReported = 0;
  let count = 0;
  let uncategorised = 0;

  for (const tx of txs) {
    const d = taxDateOf(tx);
    if (yearOf(d) !== year || quarterOf(d) !== quarter) continue;
    if (tx.categoryKind == null) {
      uncategorised++;
      continue;
    }
    const side = vatSide(tx);
    if (!side) continue;
    count++;
    const code = effectiveVatCode(tx);
    const gross = side === "sales" ? tx.amount : -tx.amount;
    const { base, vat } = splitVat(gross, code, rates, tx.vatAmount);

    if (side === "sales") {
      if (code === "high") add("1a", base, vat);
      else if (code === "low") add("1b", base, vat);
      else if (code === "zero") add("1e", base, 0);
      else if (code === "eu") add("3b", base, 0);
      else notReported += base;
    } else {
      if (code === "high" || code === "low") add("5b", 0, vat);
      else if (code === "eu") {
        add("4b", base, vat);
        add("5b", 0, vat);
      } else if (code === "non_eu") {
        add("4a", base, vat);
        add("5b", 0, vat);
      }
    }
  }

  const list = [...boxes.values()];
  const due = list.filter((b) => b.code !== "5b").reduce((s, b) => s + b.vat, 0);
  const deductible = boxes.get("5b")!.vat;
  return {
    year,
    quarter,
    boxes: list,
    due,
    deductible,
    balance: due - deductible,
    notReported,
    transactionCount: count,
    uncategorised,
  };
}
