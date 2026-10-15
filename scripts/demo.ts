/**
 * Creates a demo database with ~2.5 years of realistic, fictional data:
 *   npm run demo            -> writes ./demo-data/finance.db
 *   npm run dev:demo        -> starts the app on that database
 * Your real data in ./data is never touched.
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { openDatabase } from "../src/lib/db/connection";
import { accounts, categories } from "../src/lib/db/schema";
import type { ParseResult, ParsedTransaction } from "../src/lib/import/types";
import { createAccount } from "../src/lib/services/accounts";
import { importBudgetLines } from "../src/lib/services/budget";
import { setCategoryManually } from "../src/lib/services/categorize";
import { commitImport } from "../src/lib/services/imports";
import { addHours, getTaxYear, saveAsset, updateTaxYear } from "../src/lib/services/tax";
import { transactions } from "../src/lib/db/schema";
import { normalizeText } from "../src/lib/text";

const dir = path.resolve(process.argv[2] ?? "demo-data");
const file = path.join(dir, "finance.db");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${file}${suffix}`, { force: true });
const { db, sqlite } = openDatabase(file);

// Deterministic randomness
let seed = 20240101;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const pad = (n: number) => String(n).padStart(2, "0");
const day = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate()))}`;

const PERSONAL_IBAN = "NL69INGB0123456789";
const SAVINGS_IBAN = "NL55INGB0000000003";
const BUSINESS_IBAN = "NL12KNAB0123456789";

type Row = Omit<ParsedTransaction, "currency" | "externalId" | "balanceAfter" | "accountIban" | "txType"> & { txType?: string };

function months(from: string, to: string): [number, number][] {
  const out: [number, number][] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push([y, m]);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function toParseResult(rows: Row[], iban: string, opening: number): ParseResult {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let balance = opening;
  const txs: ParsedTransaction[] = sorted.map((r) => {
    balance += r.amount;
    return { ...r, txType: r.txType ?? null, currency: "EUR", externalId: null, balanceAfter: balance, accountIban: iban };
  });
  return {
    format: "ing",
    formatLabel: "ING (CSV)",
    transactions: txs,
    closingBalance: { date: txs[txs.length - 1].date, amount: balance },
    warnings: [],
  };
}

// --- Personal ------------------------------------------------------------------------
const personalRows: Row[] = [];
const p = (date: string, amount: number, counterpartyName: string, description = "", counterpartyIban: string | null = null, txType?: string) =>
  personalRows.push({ date, amount, counterpartyName, description, counterpartyIban, txType });

const restaurants = ["Restaurant De Kas", "Cafe Loetje", "Bar Botanique", "Pho Saigon", "Trattoria Da Mario", "Bakkerij Wolf"];
const supermarkets = ["Albert Heijn 1403 AMSTERDAM", "Jumbo Amsterdam Oost", "Lidl 1234 Amsterdam", "AH to go 5832 Amsterdam"];

for (const [y, m] of months("2024-01", "2026-09")) {
  const salary = y === 2024 ? 345000 : y === 2025 ? 360000 : 375000;
  p(day(y, m, 24), salary, "Werkgever B.V.", `Salaris ${pad(m)}-${y}`, "NL91ABNA0417164300", "Overschrijving");
  if (m === 5) p(day(y, m, 24), salary * 0.8, "Werkgever B.V.", `Vakantiegeld ${y}`, "NL91ABNA0417164300", "Overschrijving");
  p(day(y, m, 1), y === 2024 || (y === 2025 && m < 7) ? -135000 : -142000, "Woonstichting De Key", "Huur", "NL20RABO0300065264", "Incasso");
  p(day(y, m, 3), y === 2024 ? -14500 : y === 2025 ? -16500 : -13000, "Vattenfall Klantenservice N.V.", "Termijnbedrag energie", "NL44INGB0000123456", "Incasso");
  p(day(y, m, 4), -2200, "Waternet", "Voorschot drinkwater", "NL31RABO0123123123", "Incasso");
  p(day(y, m, 2), y === 2024 ? -13850 : y === 2025 ? -14725 : -15210, "Zilveren Kruis Zorgverzekeringen NV", "Premie zorgverzekering", "NL16INGB0000656565", "Incasso");
  p(day(y, m, 6), y === 2024 ? -5500 : -5800, "Ziggo Services B.V.", "Ziggo internet & tv", "NL60INGB0000484848", "Incasso");
  p(day(y, m, 8), -2000, "Odido Netherlands B.V.", "Mobiel abonnement", "NL22INGB0000999888", "Incasso");
  p(day(y, m, 12), y < 2025 || (y === 2025 && m < 3) ? -1399 : -1599, "Netflix International B.V.", "Netflix.com", null, "Betaalautomaat");
  p(day(y, m, 15), y === 2024 && m < 9 ? -1099 : y === 2026 && m >= 2 ? -1299 : -1199, "Spotify AB", "Spotify Premium", "NL61BUNQ2025419999", "Incasso");
  p(day(y, m, 20), -2999, "Basic-Fit Nederland B.V.", "Lidmaatschap", "NL86INGB0002446666", "Incasso");
  if (m >= 2 && m <= 11) p(day(y, m, 28), -4500, "Gemeente Amsterdam Belastingen", "Gemeentelijke belastingen termijn", "NL77INGB0000777777", "Incasso");
  p(day(y, m, 26), -500000, "Spaarrekening", "Sparen", SAVINGS_IBAN, "Online bankieren");
  p(day(y, m, 27), m % 3 === 0 ? 600000 : 450000, "W. Freelance (zakelijk)", "Opname eigen bedrijf", BUSINESS_IBAN, "Overschrijving");

  for (let i = 0; i < 9 + Math.floor(rand() * 4); i++) {
    p(day(y, m, 1 + Math.floor(rand() * 28)), -Math.round(between(12, 95) * (y === 2026 ? 1.04 : 1)), pick(supermarkets), "Apple Pay", null, "Betaalautomaat");
  }
  for (let i = 0; i < 3 + Math.floor(rand() * 4); i++) {
    p(day(y, m, 1 + Math.floor(rand() * 28)), -between(22, 110), pick(restaurants), "Apple Pay", null, "Betaalautomaat");
  }
  for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) p(day(y, m, 1 + Math.floor(rand() * 28)), -between(18, 42), "Thuisbezorgd.nl", "Bestelling via iDEAL", null, "iDEAL");
  for (let i = 0; i < 4 + Math.floor(rand() * 3); i++) p(day(y, m, 1 + Math.floor(rand() * 28)), -between(3, 28), "NS GROEP IZ NS REIZIGERS", "OV-chipkaart", null, "Betaalautomaat");
  if (rand() < 0.8) p(day(y, m, 1 + Math.floor(rand() * 28)), -between(15, 120), "bol.com b.v.", "Bestelling bol.com", "NL18ABNA0484869868", "iDEAL");
  if (rand() < 0.3) p(day(y, m, 1 + Math.floor(rand() * 28)), -between(40, 160), "Zalando SE", "Zalando bestelling", null, "iDEAL");
  if (rand() < 0.35) p(day(y, m, 1 + Math.floor(rand() * 28)), between(12, 45), "Tikkie", "Etentje via Tikkie", "NL12ABNA0000111111", "Overschrijving");
  if (rand() < 0.25) p(day(y, m, 1 + Math.floor(rand() * 28)), -between(20, 60), "PayPal Europe S.a.r.l. et Cie S.C.A", "1046512309574 PAYPAL Steam Games", "NL41DEUT0265186439", "Incasso");
  if (rand() < 0.2) p(day(y, m, 1 + Math.floor(rand() * 28)), -5000, "", "Geldautomaat Amsterdam Centraal", null, "Geldautomaat");
  if (m === 7) p(day(y, m, 5), -between(650, 1150), "Booking.com B.V.", "Hotel reservering", null, "iDEAL");
  if (m === 6) p(day(y, m, 10), -between(380, 620), "KLM Royal Dutch Airlines", "Vliegtickets", null, "iDEAL");
  if (m === 11 && y === 2025) p(day(y, m, 18), -134900, "Coolblue B.V.", "Wasmachine", null, "iDEAL");
  if (m === 12) p(day(y, m, 15), -between(120, 260), "Bijenkorf Amsterdam", "Cadeaus", null, "Betaalautomaat");
  if (y === 2026 && m === 9) {
    // New payees this month: left for you to categorise in the review screen.
    p(day(y, m, 9), -3200, "Kapsalon Knip", "Apple Pay", null, "Betaalautomaat");
    p(day(y, m, 16), -6450, "Dierenkliniek Oost", "Consult", null, "Betaalautomaat");
    p(day(y, m, 19), -2795, "Gall & Gall 4410", "Apple Pay", null, "Betaalautomaat");
  }
}

// --- Business ----------------------------------------------------------------------
const businessRows: Row[] = [];
const b = (date: string, amount: number, counterpartyName: string, description = "", counterpartyIban: string | null = null) =>
  businessRows.push({ date, amount, counterpartyName, description, counterpartyIban });

let invoice = 1;
for (const [y, m] of months("2024-03", "2026-09")) {
  const growth = y === 2024 ? 1 : y === 2025 ? 1.12 : 1.2;
  b(day(y, m, 14), Math.round(484000 * growth), "Acme BV", `Factuur ${y}-${pad(invoice++)}`, "NL91ABNA0417164300");
  if (rand() < 0.7) b(day(y, m, 22), Math.round(between(1800, 3200) * 1.21), "Studio Noord", `Factuur ${y}-${pad(invoice++)}`, "NL39RABO0300065264");
  if (m % 3 === 0) b(day(y, m, 25), 300000, "Nordic Apps AB", `Invoice ${y}-${pad(invoice++)} (reverse charge)`, "SE4550000000058398257466");
  b(day(y, m, 2), -1380, "Google Cloud EMEA Limited", "Google Workspace", "IE64IRCE92050112345678");
  b(day(y, m, 3), -400, "GitHub, Inc.", "GitHub Pro", null);
  b(day(y, m, 5), -2419, "Adobe Systems Software Ireland", "Creative Cloud", "IE29AIBK93115212345678");
  b(day(y, m, 6), -1452, "Moneybird B.V.", "Abonnement Moneybird", "NL20INGB0006582810");
  b(day(y, m, 9), -4500, "KPN B.V.", "Zakelijk mobiel", "NL62INGB0000079575");
  b(day(y, m, 1), -30250, "Spaces Zuidas", "Flexplek", "NL33INGB0006789012");
  b(day(y, m, 10), -3500, "Hiscox", "Beroepsaansprakelijkheid", "NL73ABNA0465400000");
  b(day(y, m, 28), -895, "Knab", "Kosten zakelijke rekening", null);
  for (let i = 0; i < 2 + Math.floor(rand() * 3); i++) b(day(y, m, 1 + Math.floor(rand() * 27)), -between(6, 45), "NS GROEP IZ NS REIZIGERS", "Zakelijke reis", null);
  if (rand() < 0.5) b(day(y, m, 1 + Math.floor(rand() * 27)), -between(30, 95), "Restaurant De Kas", "Lunch met klant", null);
  b(day(y, m, 27), m % 3 === 0 ? -600000 : -450000, "W. van Freelance", "Privé opname", PERSONAL_IBAN);
  if (y >= 2025) b(day(y, m, 20), -85000, "Belastingdienst", `Voorlopige aanslag inkomstenbelasting ${y}`, "NL86INGB0002445588");
  if (m === 1 || m === 4 || m === 7 || m === 10) {
    const q = m === 1 ? 4 : (m - 1) / 3;
    const qy = m === 1 ? y - 1 : y;
    if (qy > 2024 || (qy === 2024 && q >= 2)) {
      b(day(y, m, 28), -between(3500, 4300), "Belastingdienst", `Omzetbelasting ${q}e kwartaal ${qy}`, "NL86INGB0002445588");
    }
  }
  if (m === 3 && y >= 2025) b(day(y, m, 18), -121000, "Boekhouder Jansen", `Jaarrekening en aangifte ${y - 1}`, "NL55RABO0123456700");
}
b("2025-02-11", -290400, "Coolblue B.V.", "MacBook Pro 14", null);

// --- Write -------------------------------------------------------------------------------
const personal = createAccount(db, { name: "ING Betaalrekening", kind: "personal", iban: PERSONAL_IBAN });
createAccount(db, { name: "Spaarrekening", kind: "personal", iban: SAVINGS_IBAN, description: "Savings", isSavings: true });
const business = createAccount(db, { name: "Knab Zakelijk", kind: "business", iban: BUSINESS_IBAN });

const cat = (name: string, scope: "personal" | "business") =>
  db.select().from(categories).where(eq(categories.name, name)).all().find((c) => c.scope === scope)!.id;

/** Simulates the monthly routine: import, then categorise what the rules didn't know. */
function importAndReview(accountId: number, rows: Row[], iban: string, opening: number, chunks: [string, string][], decisions: [string, string, "personal" | "business"][], leaveLastChunk = true) {
  let balance = opening;
  chunks.forEach(([from, to], i) => {
    const chunk = rows.filter((r) => r.date >= `${from}-01` && r.date <= `${to}-31`);
    const parsed = toParseResult(chunk, iban, balance);
    balance = parsed.closingBalance!.amount;
    commitImport(db, accountId, `${iban}_${from}_${to}.csv`, parsed);
    if (leaveLastChunk && i === chunks.length - 1) return;
    const open = db.select().from(transactions).where(eq(transactions.accountId, accountId)).all().filter((t) => t.categoryId == null);
    for (const [needle, category, scope] of decisions) {
      const tx = open.find((t) => normalizeText(`${t.counterpartyName} ${t.description}`).includes(normalizeText(needle)) && t.categoryId == null);
      if (tx) setCategoryManually(db, tx.id, cat(category, scope), true);
    }
  });
}

importAndReview(
  personal.id,
  personalRows,
  PERSONAL_IBAN,
  420000,
  [
    ["2024-01", "2024-12"],
    ["2025-01", "2025-12"],
    ["2026-01", "2026-08"],
    ["2026-09", "2026-09"],
  ],
  [
    ["Werkgever", "Salary", "personal"],
    ["Woonstichting", "Rent / mortgage", "personal"],
    ["Restaurant De Kas", "Restaurants & bars", "personal"],
    ["Cafe Loetje", "Restaurants & bars", "personal"],
    ["Bar Botanique", "Restaurants & bars", "personal"],
    ["Pho Saigon", "Restaurants & bars", "personal"],
    ["Trattoria", "Restaurants & bars", "personal"],
    ["Bakkerij Wolf", "Coffee & lunch", "personal"],
    ["Tikkie", "Refunds & reimbursements", "personal"],
    ["Steam", "Hobbies & entertainment", "personal"],
    ["Bijenkorf", "Gifts", "personal"],
  ],
);

importAndReview(
  business.id,
  businessRows,
  BUSINESS_IBAN,
  150000,
  [
    ["2024-03", "2024-12"],
    ["2025-01", "2025-12"],
    ["2026-01", "2026-09"],
  ],
  [
    ["Acme", "Revenue", "business"],
    ["Studio Noord", "Revenue", "business"],
    ["Nordic Apps", "Revenue (EU, reverse charge)", "business"],
    ["Spaces Zuidas", "Office / coworking", "business"],
    ["Hiscox", "Business insurance", "business"],
    ["Restaurant De Kas", "Meals & representation", "business"],
    ["Boekhouder", "Accountant & administration", "business"],
    ["MacBook", "Asset purchases (depreciated)", "business"],
    ["Knab Kosten", "Bank fees", "business"],
    ["Omzetbelasting", "VAT payments & refunds", "business"],
    ["Voorlopige aanslag", "Income tax & Zvw", "business"],
  ],
  false,
);

// Budget for the personal account (monthly unless noted)
const line = (name: string, euros: number, category: string, type: "fixed" | "variable" = "fixed", frequency: "monthly" | "quarterly" | "yearly" = "monthly") => ({
  name,
  amount: euros * 100,
  categoryId: cat(category, "personal"),
  type,
  frequency,
});
importBudgetLines(db, personal.id, [
  line("Salary", 3600, "Salary"),
  line("Draw from business", 4500, "Income from own business"),
  line("Rent", 1420, "Rent / mortgage"),
  line("Energy", 150, "Energy"),
  line("Water", 22, "Water"),
  line("Health insurance", 147, "Health insurance"),
  line("Internet & TV", 58, "Internet & TV"),
  line("Phone", 20, "Mobile phone"),
  line("Netflix", 16, "Streaming & subscriptions"),
  line("Spotify", 12, "Streaming & subscriptions"),
  line("Gym", 32, "Sports & fitness"),
  line("Municipal taxes", 450, "Municipal taxes", "fixed", "yearly"),
  line("Groceries", 450, "Groceries", "variable"),
  line("Eating out", 200, "Restaurants & bars", "variable"),
  line("Takeaway", 60, "Takeaway & delivery", "variable"),
  line("Public transport", 70, "Public transport", "variable"),
  line("Shopping", 80, "General shopping", "variable"),
  line("Clothing", 50, "Clothing", "variable"),
  line("Holidays", 2000, "Holidays & travel", "variable", "yearly"),
]);

// Business extras: an asset, hours and tax year settings
saveAsset(db, business.id, {
  name: "MacBook Pro 14",
  purchaseDate: "2025-02-11",
  cost: 240000,
  residualValue: 0,
  usefulLifeYears: 4,
  kiaEligible: true,
  disposedDate: null,
  note: null,
});
for (const year of [2025, 2026]) {
  for (let week = 0; week < 52; week++) {
    const date = new Date(Date.UTC(year, 0, 6 + week * 7)).toISOString().slice(0, 10);
    if (date > "2026-09-30") break;
    if (week % 13 === 7) continue; // holidays
    addHours(db, business.id, date, 24 + Math.round(rand() * 10), "Client work, admin and acquisition");
  }
}
updateTaxYear(db, getTaxYear(db, business.id, 2025).id, { isStarter: true });

const counts = db.select().from(accounts).all().length;
sqlite.close();
console.log(`Demo database written to ${file} (${counts} accounts).`);
