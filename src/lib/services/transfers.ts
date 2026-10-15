import { eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { unmatchedTransfers, type UnmatchedTransfer } from "../analytics/transfers";
import type { DB } from "../db/connection";
import { accounts, categories, transactions, type Transaction } from "../db/schema";
import { detectOwnTransfer } from "../rules/engine";
import { normalizeIban } from "../text";
import { categorise, loadRuleContext } from "./categorize";

/** Transactions whose counterparty is one of your own accounts, or that were linked as such before. */
function candidateRows(db: DB): Transaction[] {
  const ibans = db
    .select({ iban: accounts.iban })
    .from(accounts)
    .where(isNotNull(accounts.iban))
    .all()
    .map((a) => a.iban!);
  const conditions = [eq(transactions.categorySource, "transfer")];
  if (ibans.length) conditions.push(inArray(sql`upper(replace(${transactions.counterpartyIban}, ' ', ''))`, ibans));
  return db.select().from(transactions).where(or(...conditions)).all();
}

export interface RelinkResult {
  /** Transactions (re)categorised as a transfer between own accounts */
  linked: number;
  /** Transactions no longer pointing at an own account, re-run through the rules */
  unlinked: number;
  /** Own transfers you categorised by hand differently; listed for review, not changed */
  review: number;
}

/**
 * Brings own-transfer categorisation in line with the current set of accounts and
 * IBANs. Never overrides a category you picked yourself: those are only counted
 * for the review list.
 */
export function relinkOwnTransfers(db: DB): RelinkResult {
  const ctx = loadRuleContext(db);
  const accountById = new Map(db.select().from(accounts).all().map((a) => [a.id, a]));
  const result: RelinkResult = { linked: 0, unlinked: 0, review: 0 };

  db.transaction((tx) => {
    for (const row of candidateRows(db)) {
      const account = accountById.get(row.accountId);
      if (!account) continue;
      const detected = detectOwnTransfer(row, account, ctx.accounts, ctx.categories);
      if (detected != null) {
        if (row.categorySource === "manual") {
          if (needsReview(row.categoryId, detected, ctx.kinds)) result.review++;
          continue;
        }
        if (row.categoryId === detected && row.categorySource === "transfer") continue;
        tx.update(transactions)
          .set({ categoryId: detected, categorySource: "transfer", ruleId: null })
          .where(eq(transactions.id, row.id))
          .run();
        result.linked++;
      } else if (row.categorySource === "transfer") {
        const next = categorise(row, account, ctx);
        tx.update(transactions)
          .set(
            next
              ? { categoryId: next.categoryId, categorySource: next.source, ruleId: next.ruleId }
              : { categoryId: null, categorySource: null, ruleId: null },
          )
          .where(eq(transactions.id, row.id))
          .run();
        result.unlinked++;
      }
    }
  });
  return result;
}

/** A manual category differs meaningfully from the detected transfer category. */
function needsReview(current: number | null, detected: number, kinds: Map<number, string>): boolean {
  if (current === detected) return false;
  // Both are "transfer" kind (e.g. "Savings & investments" vs "Internal transfer"): already left out of totals.
  return !(current != null && kinds.get(current) === "transfer" && kinds.get(detected) === "transfer");
}

export interface TransferReviewRow {
  id: number;
  accountId: number;
  accountName: string;
  otherAccountName: string;
  date: string;
  amount: number;
  counterpartyName: string | null;
  description: string;
  currentCategory: string | null;
  suggestedCategoryId: number;
  suggestedCategory: string;
}

export interface MissingCounterpart extends UnmatchedTransfer {
  accountName: string;
  otherAccountName: string;
  counterpartyName: string | null;
  description: string;
}

export function transferOverview(db: DB): { review: TransferReviewRow[]; missing: MissingCounterpart[] } {
  const ctx = loadRuleContext(db);
  const accountList = db.select().from(accounts).all();
  const accountById = new Map(accountList.map((a) => [a.id, a]));
  const accountByIban = new Map(accountList.filter((a) => a.iban).map((a) => [a.iban!, a]));
  const catName = new Map(db.select({ id: categories.id, name: categories.name }).from(categories).all().map((c) => [c.id, c.name]));

  const rows = candidateRows(db);
  const review: TransferReviewRow[] = [];
  const legs: Transaction[] = [];
  for (const row of rows) {
    const account = accountById.get(row.accountId)!;
    const detected = detectOwnTransfer(row, account, ctx.accounts, ctx.categories);
    if (detected == null) continue;
    legs.push(row);
    if (row.categorySource === "manual" && needsReview(row.categoryId, detected, ctx.kinds)) {
      review.push({
        id: row.id,
        accountId: row.accountId,
        accountName: account.name,
        otherAccountName: accountByIban.get(normalizeIban(row.counterpartyIban)!)?.name ?? "",
        date: row.date,
        amount: row.amount,
        counterpartyName: row.counterpartyName,
        description: row.description,
        currentCategory: row.categoryId != null ? (catName.get(row.categoryId) ?? null) : null,
        suggestedCategoryId: detected,
        suggestedCategory: catName.get(detected) ?? "",
      });
    }
  }

  const spans = db
    .select({
      accountId: transactions.accountId,
      first: sql<string>`min(${transactions.date})`,
      last: sql<string>`max(${transactions.date})`,
    })
    .from(transactions)
    .groupBy(transactions.accountId)
    .all();
  const spanOf = new Map(spans.map((s) => [s.accountId, s]));
  const legById = new Map(legs.map((l) => [l.id, l]));
  const missing = unmatchedTransfers(
    legs,
    accountList.map((a) => ({ id: a.id, iban: a.iban, first: spanOf.get(a.id)?.first ?? null, last: spanOf.get(a.id)?.last ?? null })),
  ).map((m) => {
    const leg = legById.get(m.leg.id)!;
    return {
      ...m,
      accountName: accountById.get(leg.accountId)?.name ?? "",
      otherAccountName: accountById.get(m.otherAccountId)?.name ?? "",
      counterpartyName: leg.counterpartyName,
      description: leg.description,
    };
  });

  review.sort((a, b) => b.date.localeCompare(a.date));
  missing.sort((a, b) => b.leg.date.localeCompare(a.leg.date));
  return { review, missing };
}

/** Accepts the suggested own-transfer category for the given (manually categorised) transactions. */
export function acceptTransferSuggestions(db: DB, ids: number[]): number {
  if (!ids.length) return 0;
  const ctx = loadRuleContext(db);
  const accountById = new Map(db.select().from(accounts).all().map((a) => [a.id, a]));
  const rows = db.select().from(transactions).where(inArray(transactions.id, ids)).all();
  let n = 0;
  db.transaction((tx) => {
    for (const row of rows) {
      const account = accountById.get(row.accountId);
      if (!account) continue;
      const detected = detectOwnTransfer(row, account, ctx.accounts, ctx.categories);
      if (detected == null) continue;
      tx.update(transactions)
        .set({ categoryId: detected, categorySource: "transfer", ruleId: null })
        .where(eq(transactions.id, row.id))
        .run();
      n++;
    }
  });
  return n;
}
