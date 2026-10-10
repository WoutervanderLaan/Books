"use server";

import { redirect } from "next/navigation";
import { bool, errorMessage, oneOf, optMoney, optStr, str, type ActionResult } from "@/lib/form";
import { getDb } from "@/lib/server";
import { createAccount, deleteAccount, getAccount, updateAccount } from "@/lib/services/accounts";
import { ACCOUNT_KINDS } from "@/lib/types";
import { refreshAll } from "./revalidate";

export async function createAccountAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const name = str(fd, "name");
  if (!name) return { ok: false, error: "Give the account a name." };
  let id: number;
  try {
    id = createAccount(getDb(), {
      name,
      kind: oneOf(str(fd, "kind"), ACCOUNT_KINDS, "personal"),
      iban: optStr(fd, "iban"),
      description: optStr(fd, "description"),
    }).id;
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
  });
  refreshAll();
  return { ok: true, message: "Saved." };
}

export async function clearCsvMappingAction(accountId: number): Promise<void> {
  updateAccount(getDb(), accountId, { csvMapping: null });
  refreshAll();
}

export async function deleteAccountAction(accountId: number): Promise<void> {
  deleteAccount(getDb(), accountId);
  refreshAll();
  redirect("/");
}
