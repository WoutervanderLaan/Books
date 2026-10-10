"use server";

import { bool, errorMessage, isIsoDate, oneOf, optInt, optMoney, optNumber, optStr, str, type ActionResult } from "@/lib/form";
import { getDb } from "@/lib/server";
import { addHours, deleteAsset, deleteHours, getTaxYear, saveAsset, updateTaxYear } from "@/lib/services/tax";
import { builtInParams, getPath, paramFields } from "@/lib/tax/params";
import { refreshAll } from "./revalidate";

export async function updateTaxYearAction(accountId: number, year: number, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const db = getDb();
  const taxYear = getTaxYear(db, accountId, year);
  // Only store parameters that differ from the built-in table.
  const builtIn = builtInParams(year);
  const overrides: Record<string, number> = {};
  for (const field of paramFields(builtIn)) {
    const raw = optNumber(fd, `param:${field.path}`);
    if (raw == null) continue;
    const value = field.unit === "pct" ? raw / 100 : raw;
    if (Math.abs(value - getPath(builtIn, field.path)) > 1e-9) overrides[field.path] = value;
  }
  updateTaxYear(db, taxYear.id, {
    isStarter: bool(fd, "isStarter"),
    hoursCriterion: oneOf(str(fd, "hoursCriterion"), ["auto", "yes", "no"] as const, "auto"),
    otherIncome: optMoney(fd, "otherIncome") ?? 0,
    prepaidTax: optMoney(fd, "prepaidTax") ?? 0,
    params: Object.keys(overrides).length ? overrides : null,
    notes: optStr(fd, "notes"),
  });
  refreshAll();
  return { ok: true, message: "Tax settings saved." };
}

export async function addHoursAction(accountId: number, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const date = str(fd, "date");
  const hours = optNumber(fd, "hours");
  if (!isIsoDate(date)) return { ok: false, error: "Enter a date." };
  if (hours == null || hours <= 0 || hours > 24 * 31) return { ok: false, error: "Enter the number of hours." };
  addHours(getDb(), accountId, date, hours, optStr(fd, "description"));
  refreshAll();
  return { ok: true, message: "Hours added." };
}

export async function deleteHoursAction(id: number): Promise<void> {
  deleteHours(getDb(), id);
  refreshAll();
}

export async function saveAssetAction(accountId: number, assetId: number | null, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const name = str(fd, "name");
  const purchaseDate = str(fd, "purchaseDate");
  const cost = optMoney(fd, "cost");
  if (!name) return { ok: false, error: "Name is required." };
  if (!isIsoDate(purchaseDate)) return { ok: false, error: "Enter the purchase date." };
  if (cost == null || cost <= 0) return { ok: false, error: "Enter the purchase price (excl. VAT)." };
  const disposed = str(fd, "disposedDate");
  try {
    saveAsset(
      getDb(),
      accountId,
      {
        name,
        purchaseDate,
        cost,
        residualValue: optMoney(fd, "residualValue") ?? 0,
        usefulLifeYears: Math.max(1, optInt(fd, "usefulLifeYears") ?? 5),
        kiaEligible: bool(fd, "kiaEligible"),
        disposedDate: isIsoDate(disposed) ? disposed : null,
        note: optStr(fd, "note"),
      },
      assetId ?? undefined,
    );
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  refreshAll();
  return { ok: true, message: assetId ? "Asset updated." : "Asset added." };
}

export async function deleteAssetAction(id: number): Promise<void> {
  deleteAsset(getDb(), id);
  refreshAll();
}
