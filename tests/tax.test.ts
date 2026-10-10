import { describe, expect, it } from "vitest";
import {
  depreciationForYear,
  estimateIncomeTax,
  kiaAmount,
  piecewise,
  profitAndLoss,
  type PnlTx,
} from "@/lib/tax/income-tax";
import { builtInParams, resolveParams } from "@/lib/tax/params";
import { splitVat, vatReturn, type VatTx } from "@/lib/tax/vat";

const rates = { vatHigh: 21, vatLow: 9 };

describe("splitVat", () => {
  it("extracts included VAT", () => {
    expect(splitVat(12100, "high", rates)).toEqual({ gross: 12100, base: 10000, vat: 2100 });
    expect(splitVat(10900, "low", rates)).toEqual({ gross: 10900, base: 10000, vat: 900 });
  });
  it("adds VAT on top for reverse charge", () => {
    expect(splitVat(10000, "eu", rates)).toEqual({ gross: 10000, base: 10000, vat: 2100 });
  });
  it("uses an explicit VAT amount and handles refunds", () => {
    expect(splitVat(12000, "high", rates, 2000)).toEqual({ gross: 12000, base: 10000, vat: 2000 });
    expect(splitVat(-12100, "high", rates)).toEqual({ gross: -12100, base: -10000, vat: -2100 });
  });
  it("ignores VAT under the KOR", () => {
    expect(splitVat(12100, "high", rates, null, true)).toEqual({ gross: 12100, base: 12100, vat: 0 });
  });
});

describe("vatReturn", () => {
  const tx = (over: Partial<VatTx>): VatTx => ({
    date: "2025-02-10",
    taxDate: null,
    amount: 0,
    vatCode: null,
    vatAmount: null,
    categoryKind: "expense",
    categoryRole: null,
    categoryVatCode: "high",
    ...over,
  });

  it("fills the boxes of a quarter", () => {
    const r = vatReturn(
      [
        tx({ amount: 121000, categoryKind: "income" }), // sale 1000 + 210 VAT
        tx({ amount: -24200 }), // purchase 200 + 42 VAT
        tx({ amount: -5000, categoryVatCode: "eu" }), // EU software, 50 + 10.50 reverse charge
        tx({ amount: -3000, categoryVatCode: "exempt" }), // insurance
        tx({ amount: -50000, categoryKind: "transfer" }), // VAT payment itself
        tx({ amount: 60000, categoryKind: "income", categoryVatCode: "eu" }), // EU client
        tx({ amount: -1000, categoryKind: null }), // uncategorised
        tx({ amount: -99999, date: "2025-04-01" }), // other quarter
        tx({ amount: 12100, categoryKind: "income", date: "2025-04-02", taxDate: "2025-03-31" }), // invoice dated in Q1
      ],
      2025,
      1,
      rates,
    );
    const box = (code: string) => r.boxes.find((b) => b.code === code)!;
    expect(box("1a")).toMatchObject({ base: 110000, vat: 23100 });
    expect(box("3b")).toMatchObject({ base: 60000, vat: 0 });
    expect(box("4b")).toMatchObject({ base: 5000, vat: 1050 });
    expect(box("5b").vat).toBe(4200 + 1050);
    expect(r.due).toBe(23100 + 1050);
    expect(r.balance).toBe(23100 + 1050 - 5250);
    expect(r.uncategorised).toBe(1);
  });
});

describe("tax parameters", () => {
  it("piecewise reproduces the 2025 maximum labour tax credit", () => {
    const p = builtInParams(2025);
    expect(piecewise(43071, p.arbeidskorting)).toBeCloseTo(5599, 0);
    expect(Math.max(0, piecewise(200000, p.arbeidskorting))).toBe(0);
  });
  it("applies overrides and falls back for unknown years", () => {
    expect(resolveParams(2025, { zelfstandigenaftrek: 1000, "box1.0.rate": 0.3 }).zelfstandigenaftrek).toBe(1000);
    expect(resolveParams(2025, { "box1.0.rate": 0.3 }).box1[0].rate).toBe(0.3);
    const future = builtInParams(2031);
    expect(future.year).toBe(2031);
    expect(future.status).toBe("provisional");
  });
});

describe("estimateIncomeTax", () => {
  it("matches a hand calculation for €60k profit in 2025", () => {
    const r = estimateIncomeTax({
      profit: 6_000_000,
      kia: 0,
      hoursCriterionMet: true,
      isStarter: false,
      otherIncome: 0,
      params: builtInParams(2025),
    });
    expect(r.zelfstandigenaftrek).toBe(247_000);
    expect(r.taxableProfit / 100).toBeCloseTo(50223.69, 1);
    expect(r.box1Tax / 100).toBeCloseTo(11367.08, 0);
    expect(r.zvw / 100).toBeCloseTo(2641.77, 0);
    expect(r.effectiveRate!).toBeGreaterThan(0.2);
    expect(r.effectiveRate!).toBeLessThan(0.26);
  });

  it("skips entrepreneur deductions without the hours criterion", () => {
    const r = estimateIncomeTax({
      profit: 2_000_000,
      kia: 0,
      hoursCriterionMet: false,
      isStarter: true,
      otherIncome: 4_000_000,
      params: builtInParams(2025),
    });
    expect(r.zelfstandigenaftrek).toBe(0);
    expect(r.startersaftrek).toBe(0);
    expect(r.businessIncomeTax).toBeGreaterThan(0);
  });
});

describe("assets", () => {
  const laptop = {
    id: 1,
    name: "Laptop",
    purchaseDate: "2024-07-15",
    cost: 300_000,
    residualValue: 0,
    usefulLifeYears: 5,
    kiaEligible: true,
    disposedDate: null,
  };
  it("depreciates pro rata and adds up to the depreciable amount", () => {
    expect(depreciationForYear(laptop, 2024, 45_000)).toBe(30_000); // 6 months
    expect(depreciationForYear(laptop, 2025, 45_000)).toBe(60_000);
    let total = 0;
    for (let y = 2024; y <= 2030; y++) total += depreciationForYear(laptop, y, 45_000);
    expect(total).toBe(300_000);
  });
  it("calculates KIA", () => {
    const p = builtInParams(2025);
    expect(kiaAmount(250_000, p)).toBe(0); // below threshold
    expect(kiaAmount(1_000_000, p)).toBe(280_000);
    expect(kiaAmount(10_000_000, p)).toBe(1_976_900);
  });
});

describe("profitAndLoss", () => {
  const tx = (over: Partial<PnlTx>): PnlTx => ({
    date: "2025-05-01",
    taxDate: null,
    amount: 0,
    vatCode: null,
    vatAmount: null,
    categoryId: 1,
    categoryName: "Revenue",
    categoryKind: "income",
    categoryRole: null,
    categoryVatCode: "high",
    categoryTaxGroup: "revenue",
    deductiblePct: 100,
    ...over,
  });
  it("uses amounts excluding VAT and partial deductibility", () => {
    const pnl = profitAndLoss(
      [
        tx({ amount: 1_210_000 }),
        tx({ amount: -10_900, categoryId: 2, categoryName: "Meals", categoryKind: "expense", categoryVatCode: "low", categoryTaxGroup: "sales", deductiblePct: 80 }),
        tx({ amount: -363_000, categoryId: 3, categoryKind: "expense", categoryRole: "asset" }),
        tx({ amount: -100_000, categoryId: 4, categoryKind: "transfer" }),
        tx({ amount: -5_000, categoryId: null, categoryKind: null }),
      ],
      2025,
      rates,
      false,
      60_000,
    );
    expect(pnl.totalIncome).toBe(1_000_000);
    expect(pnl.totalCosts).toBe(8_000);
    expect(pnl.nonDeductible).toBe(2_000);
    expect(pnl.profit).toBe(1_000_000 - 8_000 - 60_000);
    expect(pnl.uncategorised.count).toBe(1);
  });
});
