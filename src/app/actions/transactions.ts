"use server";

import { describeRule } from "@/lib/rules/engine";
import { errorMessage, isIsoDate, optInt, optMoney, optStr, str, type ActionResult } from "@/lib/form";
import { getDb } from "@/lib/server";
import { setCategoryManually } from "@/lib/services/categorize";
import {
  addManualTransaction,
  deleteTransaction,
  getTransaction,
  updateTransactionDetails,
} from "@/lib/services/transactions";
import { VAT_CODES, type VatCode } from "@/lib/types";
import { refreshAll } from "./revalidate";

export async function setCategoryAction(transactionId: number, categoryId: number | null, remember: boolean): Promise<ActionResult> {
  try {
    const { rule, applied } = setCategoryManually(getDb(), transactionId, categoryId, remember);
    refreshAll();
    if (!rule) return { ok: true };
    const more = applied ? `, also applied to ${applied} other transaction${applied === 1 ? "" : "s"}` : "";
    return { ok: true, message: `Remembered: ${describeRule(rule)}${more}.` };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function updateTransactionAction(transactionId: number, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const vat = str(fd, "vatCode");
  const taxDate = str(fd, "taxDate");
  if (taxDate && !isIsoDate(taxDate)) return { ok: false, error: "Invoice date must be a date." };
  updateTransactionDetails(getDb(), transactionId, {
    note: optStr(fd, "note"),
    vatCode: (VAT_CODES as readonly string[]).includes(vat) ? (vat as VatCode) : null,
    vatAmount: optMoney(fd, "vatAmount"),
    taxDate: taxDate || null,
  });
  refreshAll();
  return { ok: true, message: "Saved." };
}

export async function addManualTransactionAction(accountId: number, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const date = str(fd, "date");
  const amount = optMoney(fd, "amount");
  if (!isIsoDate(date)) return { ok: false, error: "Enter a date." };
  if (amount == null || amount === 0) return { ok: false, error: "Enter an amount (negative for money out)." };
  const direction = str(fd, "direction");
  const signed = direction === "out" ? -Math.abs(amount) : Math.abs(amount);
  const vat = str(fd, "vatCode");
  addManualTransaction(getDb(), accountId, {
    date,
    amount: signed,
    counterpartyName: optStr(fd, "counterpartyName"),
    description: optStr(fd, "description"),
    categoryId: optInt(fd, "categoryId"),
    vatCode: (VAT_CODES as readonly string[]).includes(vat) ? (vat as VatCode) : null,
    note: optStr(fd, "note"),
  });
  refreshAll();
  return { ok: true, message: "Transaction added." };
}

export async function deleteTransactionAction(transactionId: number): Promise<ActionResult> {
  const tx = getTransaction(getDb(), transactionId);
  if (!tx) return { ok: false, error: "Not found." };
  deleteTransaction(getDb(), transactionId);
  refreshAll();
  return { ok: true, message: "Deleted." };
}
