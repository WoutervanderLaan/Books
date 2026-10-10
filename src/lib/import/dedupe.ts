import { createHash } from "node:crypto";
import { normalizeText } from "../text";
import type { ParsedTransaction } from "./types";

/**
 * Builds a stable key per transaction so re-importing an overlapping period
 * doesn't create duplicates. Identical rows within one file get an occurrence
 * suffix (#1, #2) so genuine repeats (two coffees, same day, same price) survive.
 */
export function dedupeKeys(txs: ParsedTransaction[]): string[] {
  const seen = new Map<string, number>();
  return txs.map((t) => {
    const material = t.externalId
      ? ["ext", t.externalId, t.date, t.amount].join("|")
      : [
          t.date,
          t.amount,
          t.counterpartyIban ?? "",
          normalizeText(t.counterpartyName),
          normalizeText(t.description),
          t.balanceAfter ?? "",
        ].join("|");
    const base = createHash("sha1").update(material).digest("hex").slice(0, 20);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

/** Loose fingerprint used to warn about likely duplicates across different file formats. */
export function looseFingerprint(t: { date: string; amount: number }): string {
  return `${t.date}|${t.amount}`;
}
