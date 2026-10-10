import { describe, expect, it } from "vitest";
import {
  descriptionKey,
  detectOwnTransfer,
  findMatchingRule,
  merchantKey,
  sortRules,
  suggestRule,
  type RuleLike,
} from "@/lib/rules/engine";
import { detectRecurring, budgetVsActual, catMap, type TxRow, type CatRow } from "@/lib/analytics";

const rule = (over: Partial<RuleLike>): RuleLike => ({
  id: 1,
  accountId: null,
  accountKind: null,
  counterpartyContains: null,
  descriptionContains: null,
  counterpartyIban: null,
  direction: null,
  amountMin: null,
  amountMax: null,
  categoryId: 1,
  vatCode: null,
  priority: 0,
  enabled: true,
  source: "user",
  ...over,
});

const personal = { id: 1, kind: "personal" as const, iban: "NL69INGB0123456789" };
const business = { id: 2, kind: "business" as const, iban: "NL12KNAB0123456789" };

const tx = (name: string | null, description = "", amount = -1000, iban: string | null = null) => ({
  amount,
  counterpartyName: name,
  counterpartyIban: iban,
  description,
});

describe("merchant keys", () => {
  it.each([
    ["Albert Heijn 1403 AMSTERDAM", "albert heijn"],
    ["AH to go 5832 Utrecht", "ah to go"],
    ["Werkgever B.V.", "werkgever"],
    ["Zettle_*Bakkerij De Wit", "zettle bakkerij de wit"],
    ["NS GROEP IZ NS REIZIGERS", "ns groep iz ns"],
  ])("%s -> %s", (name, key) => expect(merchantKey(name)).toBe(key));

  it("extracts description keywords", () => {
    expect(descriptionKey("1046512309574 PAYPAL Spotify Premium")).toBe("spotify premium");
  });
});

describe("rule matching", () => {
  it("matches whole words only", () => {
    const rules = sortRules([rule({ counterpartyContains: "shell" })]);
    expect(findMatchingRule(rules, tx("SHELL 1234 UTRECHT"), personal)).not.toBeNull();
    expect(findMatchingRule(rules, tx("Shellfish Bar"), personal)).toBeNull();
  });

  it("prefers your own rules over starter rules and specific over generic", () => {
    const rules = sortRules([
      rule({ id: 1, counterpartyContains: "belastingdienst", source: "starter", categoryId: 10 }),
      rule({ id: 2, counterpartyContains: "belastingdienst", descriptionContains: "toeslagen", source: "starter", categoryId: 11 }),
      rule({ id: 3, counterpartyContains: "albert heijn", source: "starter", categoryId: 12 }),
      rule({ id: 4, counterpartyContains: "albert heijn", source: "auto", categoryId: 13 }),
    ]);
    expect(findMatchingRule(rules, tx("Belastingdienst", "Zorgtoeslag Toeslagen", 9000), personal)?.categoryId).toBe(11);
    expect(findMatchingRule(rules, tx("Belastingdienst", "IB 2024"), personal)?.categoryId).toBe(10);
    expect(findMatchingRule(rules, tx("Albert Heijn 12"), personal)?.categoryId).toBe(13);
  });

  it("respects account scope and direction", () => {
    const rules = sortRules([
      rule({ id: 1, counterpartyContains: "kpn", accountKind: "business", categoryId: 20 }),
      rule({ id: 2, counterpartyContains: "client", direction: "in", accountId: 2, categoryId: 21 }),
    ]);
    expect(findMatchingRule(rules, tx("KPN B.V."), personal)).toBeNull();
    expect(findMatchingRule(rules, tx("KPN B.V."), business)?.categoryId).toBe(20);
    expect(findMatchingRule(rules, tx("Client", "", 5000), business)?.categoryId).toBe(21);
    expect(findMatchingRule(rules, tx("Client", "", -5000), business)).toBeNull();
  });
});

describe("rule suggestions", () => {
  it("uses the IBAN for regular transfers", () => {
    expect(suggestRule(tx("Verhuurder Jansen", "Huur", -125000, "NL20RABO0300065264"))).toEqual({
      counterpartyContains: null,
      descriptionContains: null,
      counterpartyIban: "NL20RABO0300065264",
    });
  });
  it("uses the merchant name for card payments", () => {
    expect(suggestRule(tx("AH to go 5832 Utrecht"))?.counterpartyContains).toBe("ah to go");
  });
  it("looks at the description for payment providers", () => {
    expect(suggestRule(tx("PayPal Europe S.a.r.l. et Cie S.C.A", "1046512309574 PAYPAL Spotify P1234", -999, "NL12PAYP0000000001"))).toEqual({
      counterpartyContains: "paypal",
      descriptionContains: "spotify",
      counterpartyIban: null,
    });
  });
  it("adds description keywords for multi-purpose payees", () => {
    expect(suggestRule(tx("Belastingdienst", "Omzetbelasting 4e kwartaal", -5000, "NL86INGB0002445588"))).toEqual({
      counterpartyContains: "belastingdienst",
      descriptionContains: "omzetbelasting kwartaal",
      counterpartyIban: null,
    });
  });
});

describe("own transfers", () => {
  const cats = [
    { id: 1, kind: "transfer" as const, scope: "personal" as const, role: "internal_transfer" as const },
    { id: 2, kind: "income" as const, scope: "personal" as const, role: "private" as const },
    { id: 3, kind: "transfer" as const, scope: "personal" as const, role: "private" as const },
    { id: 4, kind: "transfer" as const, scope: "business" as const, role: "private" as const },
  ];
  const savings = { id: 3, kind: "personal" as const, iban: "NL55INGB0000000003" };
  const accounts = [personal, business, savings];
  it("classifies transfers by the accounts involved", () => {
    expect(detectOwnTransfer(tx(null, "", -100, savings.iban), personal, accounts, cats)).toBe(1);
    expect(detectOwnTransfer(tx(null, "", 300000, business.iban), personal, accounts, cats)).toBe(2);
    expect(detectOwnTransfer(tx(null, "", -100, business.iban), personal, accounts, cats)).toBe(3);
    expect(detectOwnTransfer(tx(null, "", -300000, personal.iban), business, accounts, cats)).toBe(4);
    expect(detectOwnTransfer(tx(null, "", -100, "NL00OTHER"), personal, accounts, cats)).toBeNull();
  });
});

describe("analytics", () => {
  const cats: CatRow[] = [
    { id: 1, name: "Streaming", groupName: "Bills", kind: "expense", role: null },
    { id: 2, name: "Groceries", groupName: "Daily", kind: "expense", role: null },
    { id: 3, name: "Salary", groupName: "Income", kind: "income", role: null },
  ];
  let id = 0;
  const row = (date: string, amount: number, categoryId: number | null, name: string): TxRow => ({
    id: ++id,
    date,
    amount,
    categoryId,
    counterpartyName: name,
    counterpartyIban: null,
    description: "",
  });

  it("detects subscriptions and price changes", () => {
    const txs = [
      row("2025-01-05", -1099, 1, "Netflix"),
      row("2025-02-05", -1099, 1, "Netflix"),
      row("2025-03-05", -1199, 1, "Netflix"),
      row("2025-04-05", -1199, 1, "Netflix"),
      row("2025-01-07", -4500, 2, "Jumbo 123"),
      row("2025-01-09", -8000, 2, "Jumbo 123"),
      row("2025-03-20", -2500, 2, "Jumbo 123"),
    ];
    const found = detectRecurring(txs, catMap(cats));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ name: "Netflix", cadence: "monthly", lastAmount: 1199, active: true });
    expect(found[0].priceChange).toBeCloseTo(0.091, 2);
  });

  it("compares budgets with actuals over a period", () => {
    const rows = budgetVsActual(
      [
        { id: 1, categoryId: 2, name: "Food", amount: 40000, frequency: "monthly", type: "variable", startMonth: null, endMonth: null },
        { id: 2, categoryId: 1, name: "Netflix", amount: 1200, frequency: "monthly", type: "fixed", startMonth: "2025-02", endMonth: null },
        { id: 3, categoryId: 3, name: "Salary", amount: 300000, frequency: "monthly", type: "fixed", startMonth: null, endMonth: null },
      ],
      [row("2025-01-10", -45000, 2, "Jumbo"), row("2025-02-10", -30000, 2, "Jumbo"), row("2025-02-25", 310000, 3, "Employer")],
      catMap(cats),
      ["2025-01", "2025-02"],
    );
    const food = rows.find((r) => r.categoryId === 2)!;
    expect(food).toMatchObject({ budget: 80000, actual: 75000, difference: 5000 });
    expect(rows.find((r) => r.categoryId === 1)).toMatchObject({ budget: 1200, actual: 0 });
    expect(rows.find((r) => r.categoryId === 3)).toMatchObject({ budget: 600000, actual: 310000, difference: -290000 });
  });
});
