import type { CsvMapping } from "../types";

export interface ParsedTransaction {
  /** Booking date, YYYY-MM-DD */
  date: string;
  /** Signed cents (negative = money out) */
  amount: number;
  currency: string;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  description: string;
  /** Bank's transaction type label, e.g. "iDEAL", "Betaalautomaat" */
  txType: string | null;
  /** Unique id provided by the bank, when available */
  externalId: string | null;
  /** Balance after this transaction, cents, when the bank provides it */
  balanceAfter: number | null;
  /** IBAN of the account the statement belongs to */
  accountIban: string | null;
}

export interface ParseResult {
  format: string;
  formatLabel: string;
  /** Sorted oldest first */
  transactions: ParsedTransaction[];
  /** Balance at the end of the statement, when known */
  closingBalance: { date: string; amount: number } | null;
  warnings: string[];
  /** The column mapping that was applied (custom CSV layouts only) */
  mapping?: CsvMapping;
}

export interface NeedsMapping {
  needsMapping: true;
  delimiter: string;
  headers: string[];
  sample: string[][];
  /** Best-effort guess the user can adjust */
  suggestion: CsvMapping;
}

export type ParseOutcome = ParseResult | NeedsMapping;

export class ImportError extends Error {}
