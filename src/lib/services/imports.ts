import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { DB } from "../db/connection";
import { accounts, categories, imports, transactions, type ImportRecord } from "../db/schema";
import { dedupeKeys } from "../import/dedupe";
import type { ParseResult, ParsedTransaction } from "../import/types";
import { merchantKey } from "../rules/engine";
import { normalizeIban } from "../text";
import type { CsvMapping } from "../types";
import { syncOpeningBalance, updateAccount } from "./accounts";
import { applyRules, categorise, loadRuleContext } from "./categorize";
import { relinkOwnTransfers } from "./transfers";

export type RowStatus = "new" | "duplicate" | "possible_duplicate";

export interface PreviewRow {
  date: string;
  amount: number;
  counterpartyName: string | null;
  description: string;
  status: RowStatus;
  category: string | null;
}

export interface ImportPreview {
  format: string;
  formatLabel: string;
  total: number;
  newCount: number;
  duplicateCount: number;
  possibleDuplicateCount: number;
  categorisedCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  closingBalance: ParseResult["closingBalance"];
  fileIbans: string[];
  ibanMismatch: boolean;
  warnings: string[];
  rows: PreviewRow[];
}

const looseKey = (t: { date: string; amount: number; counterpartyIban: string | null; counterpartyName: string | null }) =>
  `${t.date}|${t.amount}|${normalizeIban(t.counterpartyIban) ?? merchantKey(t.counterpartyName)}`;

function classify(db: DB, accountId: number, parsed: ParseResult) {
  const keys = dedupeKeys(parsed.transactions);
  const dates = parsed.transactions.map((t) => t.date).sort();
  const existing = dates.length
    ? db
        .select({
          dedupeKey: transactions.dedupeKey,
          date: transactions.date,
          amount: transactions.amount,
          counterpartyIban: transactions.counterpartyIban,
          counterpartyName: transactions.counterpartyName,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.accountId, accountId),
            gte(transactions.date, dates[0]),
            lte(transactions.date, dates[dates.length - 1]),
          ),
        )
        .all()
    : [];
  const existingKeys = new Set(existing.map((e) => e.dedupeKey));
  const existingLoose = new Map<string, number>();
  for (const e of existing) existingLoose.set(looseKey(e), (existingLoose.get(looseKey(e)) ?? 0) + 1);

  // Each existing row can explain at most one incoming row: exact matches claim theirs first.
  const used = new Map<string, number>();
  const claim = (lk: string) => used.set(lk, (used.get(lk) ?? 0) + 1);
  const statuses: (RowStatus | null)[] = parsed.transactions.map((t, i) => {
    if (!existingKeys.has(keys[i])) return null;
    claim(looseKey(t));
    return "duplicate";
  });
  parsed.transactions.forEach((t, i) => {
    if (statuses[i]) return;
    const lk = looseKey(t);
    if ((existingLoose.get(lk) ?? 0) - (used.get(lk) ?? 0) > 0) {
      claim(lk);
      statuses[i] = "possible_duplicate";
    } else statuses[i] = "new";
  });
  return { keys, statuses: statuses as RowStatus[] };
}

export function previewImport(db: DB, accountId: number, parsed: ParseResult): ImportPreview {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) throw new Error("Account not found");
  const { statuses } = classify(db, accountId, parsed);
  const ctx = loadRuleContext(db);
  const names = new Map(db.select({ id: categories.id, name: categories.name }).from(categories).all().map((c) => [c.id, c.name]));

  let categorisedCount = 0;
  const rows: PreviewRow[] = parsed.transactions.map((t, i) => {
    const result = statuses[i] === "new" ? categorise(t, account, ctx) : null;
    if (result) categorisedCount++;
    return {
      date: t.date,
      amount: t.amount,
      counterpartyName: t.counterpartyName,
      description: t.description,
      status: statuses[i],
      category: result ? names.get(result.categoryId) ?? null : null,
    };
  });

  const fileIbans = [...new Set(parsed.transactions.map((t) => t.accountIban).filter((v): v is string => !!v))];
  return {
    format: parsed.format,
    formatLabel: parsed.formatLabel,
    total: rows.length,
    newCount: statuses.filter((s) => s === "new").length,
    duplicateCount: statuses.filter((s) => s === "duplicate").length,
    possibleDuplicateCount: statuses.filter((s) => s === "possible_duplicate").length,
    categorisedCount,
    dateFrom: parsed.transactions[0]?.date ?? null,
    dateTo: parsed.transactions[parsed.transactions.length - 1]?.date ?? null,
    closingBalance: parsed.closingBalance,
    fileIbans,
    ibanMismatch: !!account.iban && fileIbans.length > 0 && !fileIbans.includes(account.iban),
    warnings: parsed.warnings,
    rows,
  };
}

export interface ImportSummary {
  importId: number;
  inserted: number;
  duplicates: number;
  skippedPossibleDuplicates: number;
  categorised: number;
  uncategorised: number;
}

export function commitImport(
  db: DB,
  accountId: number,
  filename: string,
  parsed: ParseResult,
  opts: { includePossibleDuplicates?: boolean; mapping?: CsvMapping | null } = {},
): ImportSummary {
  const { keys, statuses } = classify(db, accountId, parsed);
  const toInsert: { tx: ParsedTransaction; key: string }[] = [];
  let duplicates = 0;
  let skipped = 0;
  parsed.transactions.forEach((tx, i) => {
    if (statuses[i] === "duplicate") duplicates++;
    else if (statuses[i] === "possible_duplicate" && !opts.includePossibleDuplicates) skipped++;
    else toInsert.push({ tx, key: keys[i] });
  });

  const record = db.transaction((dbtx) => {
    const imp = dbtx
      .insert(imports)
      .values({
        accountId,
        filename,
        format: parsed.formatLabel,
        totalRows: parsed.transactions.length,
        insertedRows: 0,
        duplicateRows: duplicates + skipped,
        categorizedRows: 0,
        dateFrom: parsed.transactions[0]?.date ?? null,
        dateTo: parsed.transactions[parsed.transactions.length - 1]?.date ?? null,
      })
      .returning()
      .get();
    let inserted = 0;
    for (const { tx, key } of toInsert) {
      const res = dbtx
        .insert(transactions)
        .values({
          accountId,
          date: tx.date,
          amount: tx.amount,
          currency: tx.currency,
          counterpartyName: tx.counterpartyName,
          counterpartyIban: tx.counterpartyIban,
          description: tx.description,
          txType: tx.txType,
          externalId: tx.externalId,
          dedupeKey: key,
          balanceAfter: tx.balanceAfter,
          importId: imp.id,
        })
        .onConflictDoNothing()
        .run();
      inserted += res.changes;
    }
    return { imp, inserted };
  });

  const categorised = applyRules(db, accountId, { importId: record.imp.id });
  db.update(imports)
    .set({ insertedRows: record.inserted, categorizedRows: categorised })
    .where(eq(imports.id, record.imp.id))
    .run();

  if (parsed.closingBalance) syncOpeningBalance(db, accountId, parsed.closingBalance);

  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  const fileIbans = [...new Set(parsed.transactions.map((t) => t.accountIban).filter(Boolean))];
  if (account && !account.iban && fileIbans.length === 1) {
    updateAccount(db, accountId, { iban: fileIbans[0] });
    // Other accounts' transfers to this IBAN are now recognisable as own transfers.
    relinkOwnTransfers(db);
  }
  if (opts.mapping) updateAccount(db, accountId, { csvMapping: opts.mapping });

  return {
    importId: record.imp.id,
    inserted: record.inserted,
    duplicates,
    skippedPossibleDuplicates: skipped,
    categorised,
    uncategorised: record.inserted - categorised,
  };
}

export function listImports(db: DB, accountId: number): ImportRecord[] {
  return db.select().from(imports).where(eq(imports.accountId, accountId)).orderBy(desc(imports.id)).all();
}

/** Removes an import and the transactions it created. */
export function undoImport(db: DB, importId: number) {
  db.transaction((tx) => {
    tx.delete(transactions).where(eq(transactions.importId, importId)).run();
    tx.delete(imports).where(eq(imports.id, importId)).run();
  });
}
