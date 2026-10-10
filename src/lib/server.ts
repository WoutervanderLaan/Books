import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "./db";
import { getAccount } from "./services/accounts";

export { getDb };

/** Loads the account from a route param or renders the 404 page. */
export function requireAccount(param: string) {
  const id = Number(param);
  const account = Number.isInteger(id) ? getAccount(getDb(), id) : undefined;
  if (!account) notFound();
  return account;
}
