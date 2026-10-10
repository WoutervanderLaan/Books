import Papa from "papaparse";
import type { CsvMapping } from "../types";
import { parseCamt } from "./camt";
import { CSV_PRESETS } from "./csv-presets";
import { fileSignature, parseWithMapping, suggestMapping } from "./generic";
import { parseMt940 } from "./mt940";
import { ImportError, type ParseOutcome, type ParseResult, type ParsedTransaction } from "./types";
import { closingFromRows, decodeBuffer, sortChronologically } from "./util";

export * from "./types";
export { fileSignature } from "./generic";

export const SUPPORTED_FORMATS = [
  "ING (CSV)",
  "Rabobank (CSV)",
  "ABN AMRO (TXT)",
  "bunq (CSV)",
  "Knab (CSV)",
  "ASN / SNS / RegioBank (CSV)",
  "CAMT.053 XML (all Dutch banks)",
  "MT940 (.sta / .940 / .txt)",
  "Any other CSV via column mapping",
];

export interface ParseOptions {
  /** Explicit mapping chosen by the user for this file. */
  mapping?: CsvMapping | null;
  /** Mapping saved on the account; used when the header matches. */
  savedMapping?: CsvMapping | null;
}

export function readCsvRows(text: string, delimiter?: string): { rows: string[][]; delimiter: string } {
  const parsed = Papa.parse<string[]>(text, {
    delimiter: delimiter ?? "",
    skipEmptyLines: "greedy",
  });
  const rows = parsed.data.filter((r) => Array.isArray(r) && r.length > 0);
  return { rows, delimiter: parsed.meta.delimiter };
}

function finish(format: string, formatLabel: string, txs: ParsedTransaction[]): ParseResult {
  const transactions = sortChronologically(txs);
  const warnings: string[] = [];
  const currencies = new Set(transactions.map((t) => t.currency));
  if ([...currencies].some((c) => c !== "EUR")) {
    warnings.push(`Non-EUR currencies found (${[...currencies].join(", ")}); amounts are used as-is.`);
  }
  return {
    format,
    formatLabel,
    transactions,
    closingBalance: closingFromRows(transactions),
    warnings,
  };
}

/** Detects the bank format of a statement file and parses it. */
export function parseStatement(buf: Uint8Array, options: ParseOptions = {}): ParseOutcome {
  const text = decodeBuffer(buf);
  const head = text.slice(0, 2000).trimStart();

  if (head.startsWith("<")) {
    if (/BkToCstmr(Stmt|AcctRpt)/.test(text)) return parseCamt(text);
    throw new ImportError("This XML file is not a CAMT.053 bank statement.");
  }
  if (/^(\{1:|:20:)/.test(head) || /\n:61:/.test(head)) return parseMt940(text);

  const { rows, delimiter } = readCsvRows(text, options.mapping?.delimiter);
  if (!rows.length) throw new ImportError("The file is empty.");

  if (options.mapping) {
    const mapping = { ...options.mapping, delimiter, signature: fileSignature(rows, options.mapping.hasHeader) };
    return { ...finish("csv", "CSV (custom mapping)", parseWithMapping(rows, mapping)), mapping };
  }

  for (const preset of CSV_PRESETS) {
    const headerIndex = preset.detect(rows);
    if (headerIndex == null) continue;
    try {
      return finish(preset.id, preset.label, preset.parse(rows, headerIndex));
    } catch (e) {
      throw new ImportError(`Looks like ${preset.label}, but a row could not be read: ${(e as Error).message}`);
    }
  }

  const saved = options.savedMapping;
  if (saved && saved.signature === fileSignature(rows, saved.hasHeader)) {
    return finish("csv", "CSV (saved mapping)", parseWithMapping(rows, saved));
  }

  const suggestion = suggestMapping(rows, delimiter);
  return {
    needsMapping: true,
    delimiter,
    headers: rows[0].map((h, i) => (suggestion.hasHeader ? h : `Column ${i + 1}`)),
    sample: rows.slice(0, 8),
    suggestion,
  };
}

export function isParseResult(outcome: ParseOutcome): outcome is ParseResult {
  return !("needsMapping" in outcome);
}
