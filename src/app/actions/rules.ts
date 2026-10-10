"use server";

import { eq } from "drizzle-orm";
import { rules } from "@/lib/db/schema";
import { errorMessage, oneOf, optInt, optMoney, optStr, str, type ActionResult } from "@/lib/form";
import { getDb } from "@/lib/server";
import { applyRules } from "@/lib/services/categorize";
import { normalizeIban } from "@/lib/text";
import { VAT_CODES, type VatCode } from "@/lib/types";
import { refreshAll } from "./revalidate";

export async function saveRuleAction(accountId: number, ruleId: number | null, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const categoryId = optInt(fd, "categoryId");
  if (!categoryId) return { ok: false, error: "Choose a category." };
  const values = {
    counterpartyContains: optStr(fd, "counterpartyContains")?.toLowerCase() ?? null,
    descriptionContains: optStr(fd, "descriptionContains")?.toLowerCase() ?? null,
    counterpartyIban: normalizeIban(optStr(fd, "counterpartyIban")),
    direction: (oneOf(str(fd, "direction"), ["in", "out", ""] as const, "") || null) as "in" | "out" | null,
    amountMin: optMoney(fd, "amountMin"),
    amountMax: optMoney(fd, "amountMax"),
    vatCode: (VAT_CODES as readonly string[]).includes(str(fd, "vatCode")) ? (str(fd, "vatCode") as VatCode) : null,
    priority: optInt(fd, "priority") ?? 0,
    categoryId,
  };
  if (!values.counterpartyContains && !values.descriptionContains && !values.counterpartyIban) {
    return { ok: false, error: "Set at least a counterparty, description or IBAN condition." };
  }
  try {
    const db = getDb();
    const scope = str(fd, "scope");
    const account = scope === "all" ? { accountId: null } : { accountId };
    if (ruleId) db.update(rules).set({ ...values, ...account }).where(eq(rules.id, ruleId)).run();
    else db.insert(rules).values({ ...values, ...account, source: "user" }).run();
    const changed = applyRules(db, accountId);
    refreshAll();
    return { ok: true, message: `Rule saved${changed ? `; ${changed} transaction${changed === 1 ? "" : "s"} categorised` : ""}.` };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function deleteRuleAction(ruleId: number): Promise<void> {
  getDb().delete(rules).where(eq(rules.id, ruleId)).run();
  refreshAll();
}

export async function toggleRuleAction(ruleId: number, enabled: boolean): Promise<void> {
  getDb().update(rules).set({ enabled }).where(eq(rules.id, ruleId)).run();
  refreshAll();
}

export async function reapplyRulesAction(accountId: number, overwrite: boolean): Promise<ActionResult> {
  const changed = applyRules(getDb(), accountId, { overwrite });
  refreshAll();
  return { ok: true, message: `${changed} transaction${changed === 1 ? "" : "s"} updated.` };
}
