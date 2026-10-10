import { collapseWhitespace, normalizeIban } from "../text";
import type { CsvMapping } from "../types";
import { ImportError, type ParsedTransaction } from "./types";
import { guessDateFormat, parseAmount, parseDate } from "./util";

export function headerSignature(header: string[]): string {
  return header.map((h) => h.trim().toLowerCase()).join("|");
}

/** Identifies a CSV layout: its header row, or its column count for header-less files. */
export function fileSignature(rows: string[][], hasHeader: boolean): string {
  const first = rows[0] ?? [];
  return hasHeader ? headerSignature(first) : `columns:${first.length}`;
}

/** Applies a user defined column mapping to CSV rows. */
export function parseWithMapping(rows: string[][], mapping: CsvMapping): ParsedTransaction[] {
  const body = (mapping.hasHeader ? rows.slice(1) : rows).filter((r) => r.some((c) => c.trim()));
  const get = (r: string[], i: number | undefined) => (i == null || i < 0 ? "" : (r[i] ?? "").trim());
  const debitValues = (mapping.debitValues ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  return body.map((r, rowIndex) => {
    try {
      let amount: number;
      if (mapping.amountMode === "split") {
        const credit = get(r, mapping.amount);
        const debit = get(r, mapping.debit);
        amount = (credit ? Math.abs(parseAmount(credit, mapping.decimal)) : 0) -
          (debit ? Math.abs(parseAmount(debit, mapping.decimal)) : 0);
      } else {
        amount = parseAmount(get(r, mapping.amount), mapping.decimal);
        if (mapping.amountMode === "indicator") {
          const marker = get(r, mapping.indicator).toLowerCase();
          amount = Math.abs(amount) * (debitValues.includes(marker) ? -1 : 1);
        }
      }
      const balance = get(r, mapping.balance);
      return {
        date: parseDate(get(r, mapping.date), mapping.dateFormat),
        amount,
        currency: "EUR",
        counterpartyName: get(r, mapping.counterpartyName) || null,
        counterpartyIban: normalizeIban(get(r, mapping.counterpartyIban)),
        description: collapseWhitespace(mapping.description.map((i) => get(r, i)).join(" ")),
        txType: null,
        externalId: get(r, mapping.externalId) || null,
        balanceAfter: balance ? parseAmount(balance, mapping.decimal) : null,
        accountIban: null,
      };
    } catch (e) {
      const line = rowIndex + (mapping.hasHeader ? 2 : 1);
      throw new ImportError(`Row ${line}: ${(e as Error).message}`);
    }
  });
}

const find = (header: string[], patterns: RegExp[], exclude: number[] = []): number | undefined => {
  for (const p of patterns) {
    const i = header.findIndex((h, idx) => !exclude.includes(idx) && p.test(h.trim().toLowerCase()));
    if (i >= 0) return i;
  }
  return undefined;
};

/** Best-effort mapping suggestion for an unknown CSV layout. */
export function suggestMapping(rows: string[][], delimiter: string): CsvMapping {
  const first = rows[0] ?? [];
  const looksLikeHeader = first.some((c) => /[a-z]{3,}/i.test(c)) && !first.some((c) => /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(c.trim()));
  const header = looksLikeHeader ? first : first.map((_, i) => `Column ${i + 1}`);
  const body = rows.slice(looksLikeHeader ? 1 : 0, 30);

  let date = find(header, [/^(boekings|transactie|booking |transaction )?dat(e|um)$/, /date|datum/]);
  if (date == null) {
    date = first.findIndex((_, i) => guessDateFormat(body.map((r) => r[i] ?? "")) != null);
    if (date < 0) date = 0;
  }
  const amount = find(header, [/^(bedrag|amount)/, /bedrag|amount|value/]) ?? 1;
  const indicator = find(header, [/af ?bij|debit\/credit|credit ?debe?t|^d\/c$|^cd$/]);
  const name = find(header, [/naam tegen|counterparty name|^name$|^naam$|payee|beneficiary|tegenpartij/, /naam|name/]);
  const iban = find(header, [/tegenrekening|counterparty (iban|account)|^counterparty$/], [date, amount]);
  const description = find(header, [/omschrijving|description|mededeling|memo|details|reference/], [name ?? -1]);
  const balance = find(header, [/saldo|balance/]);

  const amountSamples = body.map((r) => r[amount] ?? "");
  const decimal: "," | "." = amountSamples.some((s) => /,\d{1,2}$/.test(s.trim())) ? "," : ".";

  return {
    signature: fileSignature(rows, looksLikeHeader),
    delimiter,
    hasHeader: looksLikeHeader,
    date,
    dateFormat: guessDateFormat(body.map((r) => r[date] ?? "")) ?? "DD-MM-YYYY",
    amount,
    amountMode: indicator != null ? "indicator" : "signed",
    indicator,
    debitValues: "af,d,debit,dbit,debet,-",
    decimal,
    counterpartyName: name,
    counterpartyIban: iban,
    description: description != null ? [description] : [],
    balance,
  };
}

export function assertMappingUsable(mapping: CsvMapping) {
  if (mapping.date == null || mapping.amount == null) throw new ImportError("Map at least the date and amount columns.");
}
