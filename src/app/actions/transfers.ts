"use server";

import { getDb } from "@/lib/server";
import { acceptTransferSuggestions } from "@/lib/services/transfers";
import { refreshAll } from "./revalidate";

/** Marks the checked transactions on the review page as transfers between own accounts. */
export async function acceptTransfersAction(fd: FormData): Promise<void> {
  const ids = fd
    .getAll("id")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  acceptTransferSuggestions(getDb(), ids);
  refreshAll();
}
