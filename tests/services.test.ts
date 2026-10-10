import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type DB } from "@/lib/db/connection";
import { categories, rules, transactions } from "@/lib/db/schema";
import { isParseResult, parseStatement, type ParseResult } from "@/lib/import";
import { accountStats, createAccount, getAccount } from "@/lib/services/accounts";
import { setCategoryManually } from "@/lib/services/categorize";
import { commitImport, previewImport, undoImport } from "@/lib/services/imports";
import { taxOverview } from "@/lib/services/tax";

const parse = (name: string): ParseResult => {
  const outcome = parseStatement(new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures", name))));
  if (!isParseResult(outcome)) throw new Error("needs mapping");
  return outcome;
};

let db: DB;
const categoryId = (name: string, scope: "personal" | "business") =>
  db.select().from(categories).where(eq(categories.name, name)).all().find((c) => c.scope === scope)!.id;

beforeEach(() => {
  db = openDatabase(":memory:").db;
});

describe("import pipeline", () => {
  it("imports, categorises with starter rules, syncs the balance and skips duplicates", () => {
    const account = createAccount(db, { name: "ING", kind: "personal" });
    const parsed = parse("ing.csv");

    const preview = previewImport(db, account.id, parsed);
    expect(preview).toMatchObject({ total: 3, newCount: 3, duplicateCount: 0, categorisedCount: 1 });

    const summary = commitImport(db, account.id, "ing.csv", parsed);
    expect(summary).toMatchObject({ inserted: 3, duplicates: 0, categorised: 1, uncategorised: 2 });

    const groceries = db.select().from(transactions).all().find((t) => t.counterpartyName?.startsWith("Albert Heijn"))!;
    expect(groceries.categoryId).toBe(categoryId("Groceries", "personal"));
    expect(groceries.categorySource).toBe("rule");

    const updated = getAccount(db, account.id)!;
    expect(updated.iban).toBe("NL69INGB0123456789");
    expect(accountStats(db, updated).balance).toBe(197655);

    const again = commitImport(db, account.id, "ing.csv", parsed);
    expect(again).toMatchObject({ inserted: 0, duplicates: 3 });

    undoImport(db, summary.importId);
    expect(db.select().from(transactions).all()).toHaveLength(0);
  });

  it("flags the same transactions from another format as likely duplicates", () => {
    const account = createAccount(db, { name: "ING", kind: "personal" });
    commitImport(db, account.id, "statement.xml", parse("camt053.xml"));
    const preview = previewImport(db, account.id, parse("mt940.sta"));
    expect(preview.possibleDuplicateCount).toBe(2);
    expect(preview.newCount).toBe(0);
    const summary = commitImport(db, account.id, "statement.sta", parse("mt940.sta"));
    expect(summary.inserted).toBe(0);
    expect(summary.skippedPossibleDuplicates).toBe(2);
  });
});

describe("learning from manual categorisation", () => {
  it("creates an account rule and applies it to matching transactions", () => {
    const account = createAccount(db, { name: "Knab", kind: "business" });
    commitImport(db, account.id, "knab.csv", parse("knab.csv"));
    const acme = db.select().from(transactions).all().find((t) => t.counterpartyName === "Acme BV")!;

    const result = setCategoryManually(db, acme.id, categoryId("Revenue", "business"), true);
    expect(result.rule).toMatchObject({ accountId: account.id, counterpartyIban: "NL91ABNA0417164300", source: "auto" });

    // A new invoice from the same client next month is recognised on import
    const next = parse("knab.csv");
    next.transactions = next.transactions.map((t) => ({ ...t, date: t.date.replace("2024-01", "2024-02"), externalId: `${t.externalId}-feb` }));
    const summary = commitImport(db, account.id, "knab-feb.csv", next);
    expect(summary.categorised).toBe(2);
    const feb = db.select().from(transactions).all().find((t) => t.date === "2024-02-16")!;
    expect(feb.categoryId).toBe(categoryId("Revenue", "business"));
    expect(db.select().from(rules).where(eq(rules.source, "auto")).all()).toHaveLength(1);
  });

  it("recognises transfers between your own accounts", () => {
    const personal = createAccount(db, { name: "ING", kind: "personal", iban: "NL69INGB0123456789" });
    createAccount(db, { name: "Savings", kind: "personal", iban: "NL20RABO0300065264" });
    commitImport(db, personal.id, "ing.csv", parse("ing.csv"));
    const rent = db.select().from(transactions).all().find((t) => t.counterpartyIban === "NL20RABO0300065264")!;
    expect(rent.categorySource).toBe("transfer");
    expect(rent.categoryId).toBe(categoryId("Internal transfer", "personal"));
  });
});

describe("tax overview", () => {
  it("builds VAT returns and a profit figure from a business account", () => {
    const account = createAccount(db, { name: "Knab", kind: "business" });
    commitImport(db, account.id, "knab.csv", parse("knab.csv"));
    const acme = db.select().from(transactions).all().find((t) => t.counterpartyName === "Acme BV")!;
    setCategoryManually(db, acme.id, categoryId("Revenue", "business"), true);

    const o = taxOverview(db, getAccount(db, account.id)!, 2024);
    expect(o.pnl.totalIncome).toBe(200000);
    // Moneybird (starter rule: accountant & administration, 21%): 121 incl. VAT -> 100 cost
    expect(o.pnl.totalCosts).toBe(10000);
    const q1 = o.vat[0];
    expect(q1.boxes.find((b) => b.code === "1a")).toMatchObject({ base: 200000, vat: 42000 });
    expect(q1.deductible).toBe(2100);
    expect(q1.balance).toBe(39900);
  });
});
