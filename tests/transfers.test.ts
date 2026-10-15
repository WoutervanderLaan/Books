import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { putAside, unmatchedTransfers } from "@/lib/analytics/transfers";
import { openDatabase, type DB } from "@/lib/db/connection";
import { categories, rules, transactions } from "@/lib/db/schema";
import { findMatchingRule, kindFitsAmount, sortRules, type RuleLike } from "@/lib/rules/engine";
import { createAccount, updateAccount } from "@/lib/services/accounts";
import { applyRules, setCategoryManually } from "@/lib/services/categorize";
import { combinedData } from "@/lib/services/dashboard";
import { acceptTransferSuggestions, relinkOwnTransfers, transferOverview } from "@/lib/services/transfers";

const CHECKING = "NL69INGB0123456789";
const SAVINGS = "NL55INGB0000000003";

describe("category kind vs. sign", () => {
  const rule = (over: Partial<RuleLike>): RuleLike => ({
    id: 1, accountId: null, accountKind: null, counterpartyContains: "werkgever", descriptionContains: null,
    counterpartyIban: null, direction: null, amountMin: null, amountMax: null, categoryId: 1, vatCode: null,
    priority: 0, enabled: true, source: "auto", ...over,
  });
  const account = { id: 1, kind: "personal" as const, iban: null };
  const tx = (amount: number) => ({ amount, counterpartyName: "Werkgever BV", counterpartyIban: null, description: "" });
  const kinds = new Map([[1, "income" as const], [2, "expense" as const]]);

  it("knows which kinds fit money in and out", () => {
    expect(kindFitsAmount("income", 100)).toBe(true);
    expect(kindFitsAmount("income", -100)).toBe(false);
    expect(kindFitsAmount("expense", -100)).toBe(true);
    expect(kindFitsAmount("transfer", -100)).toBe(true);
  });

  it("skips rules whose category doesn't fit, unless the rule has a direction", () => {
    const rules = sortRules([rule({})]);
    expect(findMatchingRule(rules, tx(300000), account, kinds)?.id).toBe(1);
    expect(findMatchingRule(rules, tx(-5000), account, kinds)).toBeNull();
    // Falls through to a rule that does fit
    const both = sortRules([rule({}), rule({ id: 2, categoryId: 2, priority: -1 })]);
    expect(findMatchingRule(both, tx(-5000), account, kinds)?.id).toBe(2);
    // Explicit refund rule: money in for an expense category
    const refund = sortRules([rule({ categoryId: 2, direction: "in" })]);
    expect(findMatchingRule(refund, tx(5000), account, kinds)?.id).toBe(1);
  });
});

describe("pairing own transfers", () => {
  const accounts = [
    { id: 1, iban: CHECKING, first: "2025-01-01", last: "2025-03-31" },
    { id: 2, iban: SAVINGS, first: "2025-02-01", last: "2025-03-31" },
  ];
  const leg = (id: number, accountId: number, date: string, amount: number, iban: string) => ({ id, accountId, date, amount, counterpartyIban: iban });

  it("matches opposite amounts a few days apart and reports the rest", () => {
    const missing = unmatchedTransfers(
      [
        leg(1, 1, "2025-01-10", -10000, SAVINGS), // before savings statements start: not judged
        leg(2, 1, "2025-02-10", -20000, SAVINGS),
        leg(3, 2, "2025-02-11", 20000, CHECKING),
        leg(4, 1, "2025-03-01", -5000, SAVINGS), // nothing on the savings side
        leg(5, 2, "2025-03-20", -7000, CHECKING),
        leg(6, 1, "2025-03-20", 7000, SAVINGS),
      ],
      accounts,
    );
    expect(missing.map((m) => m.leg.id)).toEqual([4]);
    expect(missing[0].otherAccountId).toBe(2);
  });

  it("counts savings balance changes and outside investments as put aside", () => {
    const roles = new Map<number, string | null>([[9, "savings"]]);
    const own = new Set([CHECKING, SAVINGS]);
    const tx = (accountId: number, amount: number, iban: string | null, categoryId: number | null = null) => ({ accountId, date: "2025-01-01", amount, counterpartyIban: iban, categoryId });
    expect(
      putAside(
        [tx(1, -20000, SAVINGS, 9), tx(2, 20000, CHECKING), tx(2, 150, null), tx(1, -5000, "NL00BROKER", 9)],
        roles,
        [{ id: 2, iban: SAVINGS, first: "2025-01-01", last: "2025-01-31" }],
        own,
      ),
    ).toBe(20000 + 150 + 5000);
    // Without savings statements, the deposit seen on the checking side counts
    expect(putAside([tx(1, -20000, SAVINGS, 9)], roles, [{ id: 2, iban: SAVINGS, first: null, last: null }], own)).toBe(20000);
  });
});

describe("own accounts in the database", () => {
  let db: DB;
  let n = 0;
  const catId = (name: string) => db.select().from(categories).where(eq(categories.name, name)).all().find((c) => c.scope === "personal")!.id;
  const insert = (accountId: number, date: string, amount: number, iban: string | null, categoryId: number | null = null, source: "manual" | "rule" | null = null) =>
    db
      .insert(transactions)
      .values({ accountId, date, amount, counterpartyIban: iban, counterpartyName: "Me", dedupeKey: `k${++n}`, categoryId, categorySource: categoryId ? source : null })
      .returning()
      .get();

  beforeEach(() => {
    db = openDatabase(":memory:").db;
  });

  it("relinks past transfers when a savings account is added, but leaves manual choices for review", () => {
    const checking = createAccount(db, { name: "Checking", kind: "personal", iban: CHECKING });
    const untouched = insert(checking.id, "2025-01-05", -10000, SAVINGS);
    const byRule = insert(checking.id, "2025-01-06", -20000, SAVINGS, catId("Miscellaneous"), "rule");
    const manual = insert(checking.id, "2025-01-07", -30000, SAVINGS, catId("Miscellaneous"), "manual");
    const manualSavings = insert(checking.id, "2025-01-08", -40000, SAVINGS, catId("Savings & investments"), "manual");
    insert(checking.id, "2025-01-09", -5000, "NL00SHOP0000000001", catId("Groceries"), "manual");

    const savings = createAccount(db, { name: "Savings", kind: "personal", iban: SAVINGS, isSavings: true });
    expect(savings.isSavings).toBe(true);
    const result = relinkOwnTransfers(db);
    expect(result).toEqual({ linked: 2, unlinked: 0, review: 1 });

    const get = (id: number) => db.select().from(transactions).where(eq(transactions.id, id)).get()!;
    const internal = catId("Internal transfer");
    expect(get(untouched.id)).toMatchObject({ categoryId: internal, categorySource: "transfer" });
    expect(get(byRule.id)).toMatchObject({ categoryId: internal, categorySource: "transfer" });
    expect(get(manual.id)).toMatchObject({ categoryId: catId("Miscellaneous"), categorySource: "manual" });
    expect(get(manualSavings.id).categoryId).toBe(catId("Savings & investments"));

    const overview = transferOverview(db);
    expect(overview.review.map((r) => r.id)).toEqual([manual.id]);
    // Savings has no statements yet, so nothing is reported as missing
    expect(overview.missing).toEqual([]);

    expect(acceptTransferSuggestions(db, [manual.id])).toBe(1);
    expect(get(manual.id)).toMatchObject({ categoryId: internal, categorySource: "transfer" });

    // Removing the IBAN undoes the automatic links, not your own choices
    updateAccount(db, savings.id, { iban: null });
    expect(relinkOwnTransfers(db).unlinked).toBe(3);
    expect(get(untouched.id).categoryId).toBeNull();
    expect(get(manualSavings.id).categoryId).toBe(catId("Savings & investments"));
  });

  it("combines personal accounts, leaving transfers out and counting savings as put aside", () => {
    const checking = createAccount(db, { name: "Checking", kind: "personal", iban: CHECKING });
    const savings = createAccount(db, { name: "Savings", kind: "personal", iban: SAVINGS, isSavings: true });
    const business = createAccount(db, { name: "Business", kind: "business", iban: "NL12KNAB0123456789" });
    insert(checking.id, "2025-01-25", 300000, "NL00WERK0000000001", catId("Salary"), "manual");
    insert(checking.id, "2025-01-26", -100000, null, catId("Groceries"), "manual");
    // Mis-categorised by hand as spending, but between own accounts: ignored in the combined view
    insert(checking.id, "2025-01-27", -50000, SAVINGS, catId("Miscellaneous"), "manual");
    insert(savings.id, "2025-01-27", 50000, CHECKING);
    insert(savings.id, "2025-01-31", 125, null, catId("Interest & investments"), "manual");
    insert(business.id, "2025-01-10", 99999, null);

    const data = combinedData(db, "month-2025-01");
    expect(data.accounts.map((a) => a.account.name)).toEqual(["Checking", "Savings"]);
    expect(data.totals).toMatchObject({ income: 300125, expenses: 100000 });
    expect(data.putAside).toBe(50125);
    expect(data.accounts.find((a) => a.account.id === checking.id)!.internal).toBe(-50000);
    expect(data.accounts.reduce((s, a) => s + a.internal, 0)).toBe(0);
  });

  it("remembers a refund as a separate rule with a direction", () => {
    const checking = createAccount(db, { name: "Checking", kind: "personal", iban: CHECKING });
    const shop = "NL00SHOP0000000001";
    const purchase = insert(checking.id, "2025-01-05", -8000, shop);
    const refund = insert(checking.id, "2025-01-09", 8000, shop);
    const later = insert(checking.id, "2025-02-05", -3000, shop);

    setCategoryManually(db, purchase.id, catId("Clothing"), true);
    // The regular rule doesn't turn the refund into spending
    expect(db.select().from(transactions).where(eq(transactions.id, refund.id)).get()!.categoryId).toBeNull();
    expect(db.select().from(transactions).where(eq(transactions.id, later.id)).get()!.categoryId).toBe(catId("Clothing"));

    const { rule } = setCategoryManually(db, refund.id, catId("Clothing"), true);
    expect(rule).toMatchObject({ direction: "in", counterpartyIban: shop });
    expect(db.select().from(rules).all().filter((r) => r.source === "auto")).toHaveLength(2);

    const nextRefund = insert(checking.id, "2025-03-01", 2000, shop);
    applyRules(db, checking.id);
    expect(db.select().from(transactions).where(eq(transactions.id, nextRefund.id)).get()!.categoryId).toBe(catId("Clothing"));
  });
});
