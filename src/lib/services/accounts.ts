import { and, asc, eq, sql } from "drizzle-orm";
import type { DB } from "../db/connection";
import { accounts, categories, transactions, type Account, type Category } from "../db/schema";
import { normalizeIban } from "../text";
import type { AccountKind } from "../types";

export function listAccounts(db: DB, opts: { includeArchived?: boolean } = {}): Account[] {
  const rows = db.select().from(accounts).orderBy(asc(accounts.kind), asc(accounts.name)).all();
  return opts.includeArchived ? rows : rows.filter((a) => !a.archived);
}

export function getAccount(db: DB, id: number): Account | undefined {
  return db.select().from(accounts).where(eq(accounts.id, id)).get();
}

export interface AccountInput {
  name: string;
  kind: AccountKind;
  iban?: string | null;
  description?: string | null;
}

export function createAccount(db: DB, input: AccountInput): Account {
  return db
    .insert(accounts)
    .values({
      name: input.name.trim(),
      kind: input.kind,
      iban: normalizeIban(input.iban),
      description: input.description?.trim() || null,
    })
    .returning()
    .get();
}

export function updateAccount(
  db: DB,
  id: number,
  patch: Partial<Pick<Account, "name" | "iban" | "description" | "openingBalance" | "autoBalance" | "vatKor" | "archived" | "csvMapping">>,
) {
  const values = { ...patch };
  if ("iban" in values) values.iban = normalizeIban(values.iban);
  db.update(accounts).set(values).where(eq(accounts.id, id)).run();
}

export function deleteAccount(db: DB, id: number) {
  db.delete(accounts).where(eq(accounts.id, id)).run();
}

export interface AccountStats {
  balance: number;
  transactionCount: number;
  uncategorised: number;
  firstDate: string | null;
  lastDate: string | null;
}

export function accountStats(db: DB, account: Account): AccountStats {
  const row = db
    .select({
      sum: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      count: sql<number>`count(*)`,
      uncategorised: sql<number>`sum(case when ${transactions.categoryId} is null then 1 else 0 end)`,
      first: sql<string | null>`min(${transactions.date})`,
      last: sql<string | null>`max(${transactions.date})`,
    })
    .from(transactions)
    .where(eq(transactions.accountId, account.id))
    .get();
  return {
    balance: account.openingBalance + (row?.sum ?? 0),
    transactionCount: row?.count ?? 0,
    uncategorised: row?.uncategorised ?? 0,
    firstDate: row?.first ?? null,
    lastDate: row?.last ?? null,
  };
}

/** Categories usable for an account kind (its own scope plus "both"), excluding archived ones. */
export function categoriesFor(db: DB, kind: AccountKind): Category[] {
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.archived, false), sql`${categories.scope} in (${kind}, 'both')`))
    .orderBy(asc(categories.sortOrder), asc(categories.id))
    .all();
}

export function allCategories(db: DB): Category[] {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)).all();
}

/**
 * Keeps the opening balance consistent with a bank-reported balance:
 * opening = reported balance − sum of all transactions up to that date.
 */
export function syncOpeningBalance(db: DB, accountId: number, closing: { date: string; amount: number }) {
  const account = getAccount(db, accountId);
  if (!account?.autoBalance) return;
  const latest = db
    .select({ last: sql<string | null>`max(${transactions.date})` })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .get();
  if (latest?.last && latest.last > closing.date) return; // newer data already present
  const sum = db
    .select({ sum: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), sql`${transactions.date} <= ${closing.date}`))
    .get();
  db.update(accounts)
    .set({ openingBalance: closing.amount - (sum?.sum ?? 0) })
    .where(eq(accounts.id, accountId))
    .run();
}
