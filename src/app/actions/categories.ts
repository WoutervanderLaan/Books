"use server";

import { eq } from "drizzle-orm";
import { categories } from "@/lib/db/schema";
import { errorMessage, oneOf, optInt, str, type ActionResult } from "@/lib/form";
import { getDb } from "@/lib/server";
import { CATEGORY_KINDS, CATEGORY_ROLES, CATEGORY_SCOPES, TAX_GROUPS, VAT_CODES, type CategoryRole, type TaxGroup, type VatCode } from "@/lib/types";
import { refreshAll } from "./revalidate";

const maybe = <T extends string>(v: string, options: readonly T[]): T | null =>
  (options as readonly string[]).includes(v) ? (v as T) : null;

export async function saveCategoryAction(categoryId: number | null, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const name = str(fd, "name");
  const groupName = str(fd, "groupName");
  if (!name || !groupName) return { ok: false, error: "Name and group are required." };
  const values = {
    name,
    groupName,
    kind: oneOf(str(fd, "kind"), CATEGORY_KINDS, "expense"),
    scope: oneOf(str(fd, "scope"), CATEGORY_SCOPES, "personal"),
    role: maybe<CategoryRole>(str(fd, "role"), CATEGORY_ROLES),
    vatCode: maybe<VatCode>(str(fd, "vatCode"), VAT_CODES),
    taxGroup: maybe<TaxGroup>(str(fd, "taxGroup"), TAX_GROUPS),
    deductiblePct: Math.min(100, Math.max(0, optInt(fd, "deductiblePct") ?? 100)),
  };
  try {
    const db = getDb();
    if (categoryId) db.update(categories).set(values).where(eq(categories.id, categoryId)).run();
    else db.insert(categories).values({ ...values, sortOrder: 10_000 }).run();
    refreshAll();
    return { ok: true, message: categoryId ? "Category updated." : "Category added." };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function archiveCategoryAction(categoryId: number, archived: boolean): Promise<void> {
  getDb().update(categories).set({ archived }).where(eq(categories.id, categoryId)).run();
  refreshAll();
}
