import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, isNull, like, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "../db/connection";
import { categories, transactions, type Transaction } from "../db/schema";
import { normalizeIban } from "../text";
import type { CategoryKind, VatCode } from "../types";
import { applyRules } from "./categorize";

export interface TransactionFilter {
  accountId: number;
  from?: string;
  to?: string;
  /** A category id, or "none" for uncategorised */
  category?: number | "none";
  search?: string;
  direction?: "in" | "out";
  limit?: number;
  offset?: number;
  sort?: "date_desc" | "date_asc" | "amount_asc" | "amount_desc";
}

export interface TransactionRow extends Transaction {
  categoryName: string | null;
  categoryGroup: string | null;
  categoryVatCode: VatCode | null;
  categoryKind: CategoryKind | null;
}

function where(filter: TransactionFilter): SQL {
  const parts: SQL[] = [eq(transactions.accountId, filter.accountId)];
  if (filter.from) parts.push(gte(transactions.date, filter.from));
  if (filter.to) parts.push(lte(transactions.date, filter.to));
  if (filter.category === "none") parts.push(isNull(transactions.categoryId));
  else if (filter.category != null) parts.push(eq(transactions.categoryId, filter.category));
  if (filter.direction === "in") parts.push(gte(transactions.amount, 0));
  if (filter.direction === "out") parts.push(lt(transactions.amount, 0));
  if (filter.search?.trim()) {
    const q = `%${filter.search.trim()}%`;
    parts.push(
      or(
        like(transactions.counterpartyName, q),
        like(transactions.description, q),
        like(transactions.counterpartyIban, q),
        like(transactions.note, q),
      )!,
    );
  }
  return and(...parts)!;
}

export function queryTransactions(db: DB, filter: TransactionFilter): { rows: TransactionRow[]; total: number } {
  const order =
    filter.sort === "date_asc"
      ? [asc(transactions.date), asc(transactions.id)]
      : filter.sort === "amount_asc"
        ? [asc(transactions.amount)]
        : filter.sort === "amount_desc"
          ? [desc(transactions.amount)]
          : [desc(transactions.date), desc(transactions.id)];
  const rows = db
    .select({
      tx: transactions,
      categoryName: categories.name,
      categoryGroup: categories.groupName,
      categoryVatCode: categories.vatCode,
      categoryKind: categories.kind,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(where(filter))
    .orderBy(...order)
    .limit(filter.limit ?? 100)
    .offset(filter.offset ?? 0)
    .all()
    .map((r) => ({
      ...r.tx,
      categoryName: r.categoryName,
      categoryGroup: r.categoryGroup,
      categoryVatCode: r.categoryVatCode,
      categoryKind: r.categoryKind,
    }));
  const total = db.select({ n: sql<number>`count(*)` }).from(transactions).where(where(filter)).get()?.n ?? 0;
  return { rows, total };
}

/** All transactions of an account (for analytics). */
export function allTransactions(db: DB, accountId: number): Transaction[] {
  return db.select().from(transactions).where(eq(transactions.accountId, accountId)).orderBy(asc(transactions.date)).all();
}

export interface TransactionDetails {
  note?: string | null;
  vatCode?: VatCode | null;
  vatAmount?: number | null;
  taxDate?: string | null;
}

export function updateTransactionDetails(db: DB, id: number, details: TransactionDetails) {
  db.update(transactions).set(details).where(eq(transactions.id, id)).run();
}

export interface ManualTransactionInput {
  date: string;
  amount: number;
  counterpartyName?: string | null;
  description?: string | null;
  categoryId?: number | null;
  vatCode?: VatCode | null;
  note?: string | null;
}

/** Adds a transaction that isn't in a bank file (cash, mileage, an invoice paid privately, ...). */
export function addManualTransaction(db: DB, accountId: number, input: ManualTransactionInput): Transaction {
  const key = createHash("sha1")
    .update(`manual|${input.date}|${input.amount}|${Date.now()}|${Math.random()}`)
    .digest("hex")
    .slice(0, 20);
  const row = db
    .insert(transactions)
    .values({
      accountId,
      date: input.date,
      amount: input.amount,
      counterpartyName: input.counterpartyName?.trim() || null,
      description: input.description?.trim() ?? "",
      categoryId: input.categoryId ?? null,
      categorySource: input.categoryId ? "manual" : null,
      vatCode: input.vatCode ?? null,
      note: input.note ?? null,
      dedupeKey: `manual:${key}`,
      isManual: true,
    })
    .returning()
    .get();
  if (!row.categoryId) applyRules(db, accountId);
  return row;
}

export function deleteTransaction(db: DB, id: number) {
  db.delete(transactions).where(eq(transactions.id, id)).run();
}

export function getTransaction(db: DB, id: number): Transaction | undefined {
  return db.select().from(transactions).where(eq(transactions.id, id)).get();
}

/** Other transactions from the same payee, for context in the review screen. */
export function similarTransactions(db: DB, tx: Transaction, limit = 5): Transaction[] {
  const iban = normalizeIban(tx.counterpartyIban);
  const cond = iban
    ? eq(transactions.counterpartyIban, iban)
    : tx.counterpartyName
      ? eq(transactions.counterpartyName, tx.counterpartyName)
      : undefined;
  if (!cond) return [];
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, tx.accountId), cond, sql`${transactions.id} != ${tx.id}`))
    .orderBy(desc(transactions.date))
    .limit(limit)
    .all();
}
