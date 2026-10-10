import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { DB } from "../db/connection";
import { accounts, categories, rules, transactions, type Account, type Rule } from "../db/schema";
import {
  detectOwnTransfer,
  findMatchingRule,
  ruleMatches,
  sortRules,
  suggestRule,
  type AccountLike,
  type CategoryLike,
} from "../rules/engine";

export interface RuleContext {
  rules: Rule[];
  accounts: AccountLike[];
  categories: CategoryLike[];
}

export function loadRuleContext(db: DB): RuleContext {
  return {
    rules: sortRules(db.select().from(rules).where(eq(rules.enabled, true)).all()),
    accounts: db.select({ id: accounts.id, kind: accounts.kind, iban: accounts.iban }).from(accounts).all(),
    categories: db
      .select({
        id: categories.id,
        kind: categories.kind,
        scope: categories.scope,
        role: categories.role,
        archived: categories.archived,
      })
      .from(categories)
      .all(),
  };
}

type TxForRules = Pick<
  typeof transactions.$inferSelect,
  "amount" | "counterpartyName" | "counterpartyIban" | "description" | "txType"
>;

export interface Categorisation {
  categoryId: number;
  source: "rule" | "transfer";
  ruleId: number | null;
  vatCode: Rule["vatCode"];
}

/** Decides a category for one transaction: own-account transfers first, then rules. */
export function categorise(tx: TxForRules, account: AccountLike, ctx: RuleContext): Categorisation | null {
  const transfer = detectOwnTransfer(tx, account, ctx.accounts, ctx.categories);
  if (transfer) return { categoryId: transfer, source: "transfer", ruleId: null, vatCode: null };
  const rule = findMatchingRule(ctx.rules, tx, account);
  if (rule) return { categoryId: rule.categoryId, source: "rule", ruleId: rule.id, vatCode: rule.vatCode };
  return null;
}

/**
 * (Re)applies rules to an account's transactions. Manually categorised
 * transactions are never touched. With `overwrite`, transactions previously
 * categorised by a rule are re-evaluated too.
 */
export function applyRules(db: DB, accountId: number, opts: { overwrite?: boolean; importId?: number } = {}): number {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) return 0;
  const ctx = loadRuleContext(db);
  const conditions = [eq(transactions.accountId, accountId)];
  if (opts.importId != null) conditions.push(eq(transactions.importId, opts.importId));
  conditions.push(
    opts.overwrite
      ? or(isNull(transactions.categorySource), ne(transactions.categorySource, "manual"))!
      : isNull(transactions.categoryId),
  );
  const rows = db.select().from(transactions).where(and(...conditions)).all();

  let changed = 0;
  const applied = new Map<number, number>();
  db.transaction((tx) => {
    for (const row of rows) {
      const result = categorise(row, account, ctx);
      if (!result) {
        if (opts.overwrite && row.categoryId != null) {
          tx.update(transactions)
            .set({ categoryId: null, categorySource: null, ruleId: null })
            .where(eq(transactions.id, row.id))
            .run();
          changed++;
        }
        continue;
      }
      if (result.categoryId === row.categoryId && result.ruleId === row.ruleId) continue;
      tx.update(transactions)
        .set({
          categoryId: result.categoryId,
          categorySource: result.source,
          ruleId: result.ruleId,
          vatCode: row.vatCode ?? result.vatCode,
        })
        .where(eq(transactions.id, row.id))
        .run();
      changed++;
      if (result.ruleId) applied.set(result.ruleId, (applied.get(result.ruleId) ?? 0) + 1);
    }
    for (const [ruleId, n] of applied) {
      tx.update(rules)
        .set({ timesApplied: sql`${rules.timesApplied} + ${n}` })
        .where(eq(rules.id, ruleId))
        .run();
    }
  });
  return changed;
}

export interface ManualCategoryResult {
  rule: Rule | null;
  /** Other transactions categorised by the remembered rule */
  applied: number;
}

/**
 * Sets a category by hand. With `remember`, also stores (or updates) a rule for
 * this account so the same payee is recognised next time, and applies it to
 * other uncategorised transactions right away.
 */
export function setCategoryManually(
  db: DB,
  transactionId: number,
  categoryId: number | null,
  remember: boolean,
): ManualCategoryResult {
  const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
  if (!row) throw new Error("Transaction not found");
  const account = db.select().from(accounts).where(eq(accounts.id, row.accountId)).get() as Account;

  db.update(transactions)
    .set({ categoryId, categorySource: categoryId == null ? null : "manual", ruleId: null })
    .where(eq(transactions.id, transactionId))
    .run();

  if (!remember || categoryId == null) return { rule: null, applied: 0 };
  const suggestion = suggestRule(row);
  if (!suggestion) return { rule: null, applied: 0 };

  const same = (col: typeof rules.counterpartyContains | typeof rules.descriptionContains | typeof rules.counterpartyIban, v: string | null) =>
    v == null ? isNull(col) : eq(col, v);
  const existing = db
    .select()
    .from(rules)
    .where(
      and(
        eq(rules.accountId, account.id),
        same(rules.counterpartyContains, suggestion.counterpartyContains),
        same(rules.descriptionContains, suggestion.descriptionContains),
        same(rules.counterpartyIban, suggestion.counterpartyIban),
        isNull(rules.direction),
        isNull(rules.amountMin),
        isNull(rules.amountMax),
      ),
    )
    .get();

  const rule = existing
    ? db.update(rules).set({ categoryId, enabled: true }).where(eq(rules.id, existing.id)).returning().get()
    : db
        .insert(rules)
        .values({ ...suggestion, accountId: account.id, categoryId, source: "auto", timesApplied: 1 })
        .returning()
        .get();

  // Apply to uncategorised transactions and to ones this rule categorised before.
  const candidates = db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, account.id),
        ne(transactions.id, transactionId),
        or(isNull(transactions.categoryId), eq(transactions.ruleId, rule.id)),
      ),
    )
    .all()
    .filter((t) => t.categorySource !== "manual" && ruleMatches(rule, t));

  if (candidates.length) {
    db.update(transactions)
      .set({ categoryId, categorySource: "rule", ruleId: rule.id })
      .where(inArray(transactions.id, candidates.map((c) => c.id)))
      .run();
    db.update(rules)
      .set({ timesApplied: sql`${rules.timesApplied} + ${candidates.length}` })
      .where(eq(rules.id, rule.id))
      .run();
  }
  return { rule, applied: candidates.length };
}
