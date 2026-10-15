"use server";

import { redirect } from "next/navigation";
import { bool, errorMessage, oneOf, optMoney, optStr, str, type ActionResult } from "@/lib/form";
import { getDb } from "@/lib/server";
import { createAccount, deleteAccount, getAccount, updateAccount } from "@/lib/services/accounts";
import { ACCOUNT_KINDS } from "@/lib/types";
import { relinkOwnTransfers } from "@/lib/services/transfers";
import { refreshAll } from "./revalidate";

export async function createAccountAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const name = str(fd, "name");
  if (!name) return { ok: false, error: "Give the account a name." };
  const type = str(fd, "kind");
  let id: number;
  try {
    const db = getDb();
    id = createAccount(db, {
      name,
      kind: type === "savings" ? "personal" : oneOf(type, ACCOUNT_KINDS, "personal"),
      isSavings: type === "savings",
      iban: optStr(fd, "iban"),
      description: optStr(fd, "description"),
    }).id;
    relinkOwnTransfers(db);
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  refreshAll();
  redirect(`/accounts/${id}/import`);
}

export async function updateAccountAction(accountId: number, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const db = getDb();
  const account = getAccount(db, accountId);
  if (!account) return { ok: false, error: "Account not found." };
  const name = str(fd, "name");
  if (!name) return { ok: false, error: "Name is required." };
  const autoBalance = bool(fd, "autoBalance");
  const opening = optMoney(fd, "openingBalance");
  updateAccount(db, accountId, {
    name,
    iban: optStr(fd, "iban"),
    description: optStr(fd, "description"),
    autoBalance,
    openingBalance: autoBalance ? account.openingBalance : (opening ?? 0),
    vatKor: account.kind === "business" ? bool(fd, "vatKor") : false,
    isSavings: account.kind === "personal" ? bool(fd, "isSavings") : false,
  });
  const { linked, review } = relinkOwnTransfers(db);
  refreshAll();
  const parts = ["Saved."];
  if (linked) parts.push(`${linked} transactions recognised as transfers between your accounts.`);
  if (review) parts.push(`${review} transactions you categorised yourself look like own transfers — see Own transfers.`);
  return { ok: true, message: parts.join(" ") };
}

export async function clearCsvMappingAction(accountId: number): Promise<void> {
  updateAccount(getDb(), accountId, { csvMapping: null });
  refreshAll();
}

export async function deleteAccountAction(accountId: number): Promise<void> {
  const db = getDb();
  deleteAccount(db, accountId);
  relinkOwnTransfers(db);
  refreshAll();
  redirect("/");
}
