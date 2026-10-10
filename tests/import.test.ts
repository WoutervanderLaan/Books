import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isParseResult, parseStatement, type ParseResult } from "@/lib/import";
import { dedupeKeys } from "@/lib/import/dedupe";
import { parseAmount, parseDate } from "@/lib/import/util";

const fixture = (name: string) => new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures", name)));

function parse(name: string): ParseResult {
  const outcome = parseStatement(fixture(name));
  if (!isParseResult(outcome)) throw new Error(`${name} needs a mapping`);
  return outcome;
}

describe("amount parsing", () => {
  it.each([
    ["1.234,56", 123456],
    ["-1.234,56", -123456],
    ["+12,34", 1234],
    ["1,234.56", 123456],
    ["-12.5", -1250],
    ["12", 1200],
    ["€ 1.000,00", 100000],
    ["1.000", 100000],
    ["(5,00)", -500],
  ])("%s -> %d", (raw, cents) => {
    expect(parseAmount(raw)).toBe(cents);
  });

  it("respects a forced decimal separator", () => {
    expect(parseAmount("1.234", ".")).toBe(123);
    expect(parseAmount("1,5", ",")).toBe(150);
  });

  it("rejects garbage", () => {
    expect(() => parseAmount("abc")).toThrow();
  });
});

describe("date parsing", () => {
  it("parses common formats", () => {
    expect(parseDate("20240131", "YYYYMMDD")).toBe("2024-01-31");
    expect(parseDate("31-01-2024", "DD-MM-YYYY")).toBe("2024-01-31");
    expect(parseDate("2024-01-31", "YYYY-MM-DD")).toBe("2024-01-31");
    expect(parseDate("01/31/2024", "MM/DD/YYYY")).toBe("2024-01-31");
  });
  it("rejects impossible dates", () => {
    expect(() => parseDate("31-02-2024", "DD-MM-YYYY")).toThrow();
  });
});

describe("ING CSV", () => {
  const r = parse("ing.csv");
  it("detects the format and sorts oldest first", () => {
    expect(r.format).toBe("ing");
    expect(r.transactions.map((t) => t.date)).toEqual(["2024-01-31", "2024-02-01", "2024-02-03"]);
  });
  it("reads amounts, counterparties and notes", () => {
    const [rent, salary, groceries] = r.transactions;
    expect(rent.amount).toBe(-125000);
    expect(rent.counterpartyIban).toBe("NL20RABO0300065264");
    expect(rent.description).toBe("Huur februari");
    expect(salary.amount).toBe(325000);
    expect(salary.description).toBe("Salaris januari 2024");
    expect(groceries.counterpartyName).toBe("Albert Heijn 1403 AMSTERDAM");
    expect(groceries.description).not.toContain("Valutadatum");
    expect(groceries.balanceAfter).toBe(197655);
    expect(r.closingBalance).toEqual({ date: "2024-02-03", amount: 197655 });
  });
});

describe("Rabobank CSV (Windows-1252 encoded)", () => {
  const r = parse("rabobank.csv");
  it("parses signed amounts and unique ids", () => {
    expect(r.format).toBe("rabobank");
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0]).toMatchObject({
      amount: -1299,
      counterpartyName: "Spotify AB",
      description: "Spotify Premium",
      txType: "Incasso",
      balanceAfter: 98701,
      externalId: "NL11RABO0123456789:000000000000004521",
    });
    expect(r.transactions[1].counterpartyName).toBe("J. de Vriës");
    expect(r.transactions[1].description).toBe("Terugbetaling etentje");
  });
});

describe("ABN AMRO TXT", () => {
  const r = parse("abnamro.txt");
  it("parses card, structured and labelled descriptions", () => {
    expect(r.format).toBe("abnamro");
    const [card, sepa, labelled] = r.transactions;
    expect(card).toMatchObject({ amount: -2450, counterpartyName: "ALBERT HEIJN 1234", txType: "Betaalautomaat" });
    expect(sepa).toMatchObject({
      amount: 250000,
      counterpartyName: "ACME BV",
      counterpartyIban: "NL91ABNA0417164300",
      description: "Factuur 2024-001",
    });
    expect(labelled).toMatchObject({
      counterpartyName: "Belastingdienst",
      counterpartyIban: "NL86INGB0002445588",
      description: "Omzetbelasting 4e kwartaal",
    });
    expect(r.closingBalance).toEqual({ date: "2024-01-12", amount: 337550 });
  });
});

describe("bunq CSV", () => {
  it("parses", () => {
    const r = parse("bunq.csv");
    expect(r.format).toBe("bunq");
    expect(r.transactions[0]).toMatchObject({ amount: -999, counterpartyName: "Netflix" });
    expect(r.transactions[1]).toMatchObject({ amount: 150000, counterpartyIban: "NL91ABNA0417164300" });
  });
});

describe("Knab CSV", () => {
  it("skips the title line and applies debit/credit", () => {
    const r = parse("knab.csv");
    expect(r.format).toBe("knab");
    expect(r.transactions[0]).toMatchObject({ date: "2024-01-15", amount: -12100, counterpartyName: "Moneybird B.V." });
    expect(r.transactions[1]).toMatchObject({ amount: 242000, externalId: "REF124" });
  });
});

describe("Volksbank CSV", () => {
  it("parses header-less ASN/SNS exports", () => {
    const r = parse("volksbank.csv");
    expect(r.format).toBe("volksbank");
    expect(r.transactions[0]).toMatchObject({
      amount: -4500,
      counterpartyName: "Belastingdienst",
      description: "Motorrijtuigenbelasting",
      balanceAfter: 95500,
    });
    expect(r.transactions[1].txType).toBe("GEA");
  });
});

describe("CAMT.053", () => {
  const r = parse("camt053.xml");
  it("reads booked entries and the closing balance", () => {
    expect(r.format).toBe("camt053");
    expect(r.transactions).toHaveLength(2); // pending entry skipped
    expect(r.transactions[0]).toMatchObject({
      amount: -125000,
      counterpartyName: "Verhuurder Jansen",
      counterpartyIban: "NL20RABO0300065264",
      description: "Huur februari",
      externalId: "REF-0001",
      accountIban: "NL69INGB0123456789",
      txType: "Transfer",
    });
    expect(r.transactions[1]).toMatchObject({ amount: 235050, counterpartyName: "Acme BV" });
    expect(r.closingBalance).toEqual({ date: "2024-01-31", amount: 210050 });
  });
});

describe("MT940", () => {
  const r = parse("mt940.sta");
  it("parses statement lines and wrapped :86: fields", () => {
    expect(r.format).toBe("mt940");
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0]).toMatchObject({
      date: "2024-01-31",
      amount: -125000,
      counterpartyName: "Verhuurder Jansen Vastgoed BV",
      counterpartyIban: "NL20RABO0300065264",
      description: "Huur februari",
      accountIban: "NL69INGB0123456789",
    });
    expect(r.transactions[1]).toMatchObject({ amount: 235050, counterpartyName: "ACME BV", description: "Factuur 2024-001" });
    expect(r.closingBalance).toEqual({ date: "2024-01-31", amount: 210050 });
  });
});

describe("unknown CSV", () => {
  it("asks for a mapping with a sensible suggestion", () => {
    const outcome = parseStatement(fixture("generic.csv"));
    expect(isParseResult(outcome)).toBe(false);
    if (isParseResult(outcome)) return;
    expect(outcome.suggestion).toMatchObject({
      hasHeader: true,
      date: 0,
      dateFormat: "DD/MM/YYYY",
      amount: 2,
      amountMode: "signed",
      decimal: ".",
      counterpartyName: 3,
      description: [1],
    });
  });

  it("parses with the mapping and recognises it next time", () => {
    const first = parseStatement(fixture("generic.csv"));
    if (isParseResult(first)) throw new Error("expected mapping request");
    const mapped = parseStatement(fixture("generic.csv"), { mapping: first.suggestion });
    if (!isParseResult(mapped)) throw new Error("expected result");
    expect(mapped.transactions.map((t) => t.amount)).toEqual([-12050, 1500]);

    const again = parseStatement(fixture("generic.csv"), { savedMapping: first.suggestion });
    expect(isParseResult(again)).toBe(true);
  });
});

describe("dedupe keys", () => {
  it("are stable across imports and distinguish identical rows", () => {
    const tx = {
      date: "2024-01-01",
      amount: -350,
      currency: "EUR",
      counterpartyName: "Coffee",
      counterpartyIban: null,
      description: "",
      txType: null,
      externalId: null,
      balanceAfter: null,
      accountIban: null,
    };
    const keys = dedupeKeys([tx, { ...tx }]);
    expect(keys[0]).not.toBe(keys[1]);
    expect(dedupeKeys([tx, { ...tx }])).toEqual(keys);
  });
});
