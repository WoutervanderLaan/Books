import { collapseWhitespace, normalizeIban } from "../text";
import { cleanIngNotes, parseAbnDescription } from "./descriptions";
import type { ParsedTransaction } from "./types";
import { guessDateFormat, parseAmount, parseDate } from "./util";

export interface CsvPreset {
  id: string;
  label: string;
  /** Returns the index of the header row (or -1 for header-less formats) when the file matches. */
  detect(rows: string[][]): number | null;
  parse(rows: string[][], headerIndex: number): ParsedTransaction[];
}

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

/** Finds a header row (within the first rows) that contains all required column names. */
function findHeader(rows: string[][], required: string[]): number | null {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const cells = rows[i].map(norm);
    if (required.every((r) => cells.includes(r))) return i;
  }
  return null;
}

function columnGetter(header: string[]) {
  const index = new Map(header.map((h, i) => [norm(h), i]));
  return (row: string[], ...names: string[]): string => {
    for (const name of names) {
      const i = index.get(name);
      if (i != null && row[i] != null) return row[i].trim();
    }
    return "";
  };
}

const optionalAmount = (raw: string, decimal?: "," | "."): number | null =>
  raw.trim() ? parseAmount(raw, decimal) : null;

function dataRows(rows: string[][], headerIndex: number) {
  return rows.slice(headerIndex + 1).filter((r) => r.some((c) => c.trim() !== ""));
}

const ing: CsvPreset = {
  id: "ing",
  label: "ING (CSV)",
  detect: (rows) =>
    findHeader(rows, ["datum", "naam / omschrijving", "af bij", "bedrag (eur)"]) ??
    findHeader(rows, ["date", "name / description", "debit/credit", "amount (eur)"]),
  parse(rows, h) {
    const col = columnGetter(rows[h]);
    const body = dataRows(rows, h);
    const format = guessDateFormat(body.slice(0, 20).map((r) => col(r, "datum", "date"))) ?? "YYYYMMDD";
    return body.map((r) => {
      const sign = /^(af|debit)$/i.test(col(r, "af bij", "debit/credit")) ? -1 : 1;
      const amount = Math.abs(parseAmount(col(r, "bedrag (eur)", "amount (eur)"), ",")) * sign;
      return {
        date: parseDate(col(r, "datum", "date"), format),
        amount,
        currency: "EUR",
        counterpartyName: col(r, "naam / omschrijving", "name / description") || null,
        counterpartyIban: normalizeIban(col(r, "tegenrekening", "counterparty")),
        description: cleanIngNotes(col(r, "mededelingen", "notifications")),
        txType: col(r, "mutatiesoort", "transaction type") || null,
        externalId: null,
        balanceAfter: optionalAmount(col(r, "saldo na mutatie", "resulting balance"), ","),
        accountIban: normalizeIban(col(r, "rekening", "account")),
      };
    });
  },
};

const RABO_CODES: Record<string, string> = {
  ba: "Betaalautomaat",
  bc: "Betaalautomaat",
  ga: "Geldautomaat",
  gb: "Geldautomaat",
  id: "iDEAL",
  ei: "Incasso",
  tb: "Eigen rekening",
  sb: "Salaris",
  cb: "Overboeking",
  bg: "Overboeking",
  eb: "Overboeking",
  sp: "Spoedoverboeking",
  db: "Diverse boekingen",
};

const rabobank: CsvPreset = {
  id: "rabobank",
  label: "Rabobank (CSV)",
  detect: (rows) => findHeader(rows, ["iban/bban", "volgnr", "datum", "bedrag", "naam tegenpartij"]),
  parse(rows, h) {
    const col = columnGetter(rows[h]);
    return dataRows(rows, h).map((r) => {
      const own = normalizeIban(col(r, "iban/bban"));
      const volgnr = col(r, "volgnr");
      const code = col(r, "code").toLowerCase();
      const description = collapseWhitespace(
        [col(r, "omschrijving-1"), col(r, "omschrijving-2"), col(r, "omschrijving-3")].join(" "),
      );
      return {
        date: parseDate(col(r, "datum"), "YYYY-MM-DD"),
        amount: parseAmount(col(r, "bedrag"), ","),
        currency: col(r, "munt") || "EUR",
        counterpartyName:
          col(r, "naam tegenpartij") || col(r, "naam uiteindelijke partij") || null,
        counterpartyIban: normalizeIban(col(r, "tegenrekening iban/bban")),
        description,
        txType: RABO_CODES[code] ?? (code || null),
        externalId: volgnr ? `${own ?? ""}:${volgnr}` : null,
        balanceAfter: optionalAmount(col(r, "saldo na trn"), ","),
        accountIban: own,
      };
    });
  },
};

const bunq: CsvPreset = {
  id: "bunq",
  label: "bunq (CSV)",
  detect: (rows) => findHeader(rows, ["date", "interest date", "amount", "account", "counterparty", "name", "description"]),
  parse(rows, h) {
    const col = columnGetter(rows[h]);
    const body = dataRows(rows, h);
    const format = guessDateFormat(body.slice(0, 20).map((r) => col(r, "date"))) ?? "YYYY-MM-DD";
    return body.map((r) => ({
      date: parseDate(col(r, "date"), format),
      amount: parseAmount(col(r, "amount")),
      currency: "EUR",
      counterpartyName: col(r, "name") || null,
      counterpartyIban: normalizeIban(col(r, "counterparty")),
      description: collapseWhitespace(col(r, "description")),
      txType: null,
      externalId: null,
      balanceAfter: null,
      accountIban: normalizeIban(col(r, "account")),
    }));
  },
};

const knab: CsvPreset = {
  id: "knab",
  label: "Knab (CSV)",
  detect: (rows) => findHeader(rows, ["rekeningnummer", "transactiedatum", "creditdebet", "bedrag", "tegenrekeninghouder"]),
  parse(rows, h) {
    const col = columnGetter(rows[h]);
    const body = dataRows(rows, h);
    const format = guessDateFormat(body.slice(0, 20).map((r) => col(r, "transactiedatum"))) ?? "DD-MM-YYYY";
    return body.map((r) => {
      const sign = /^d/i.test(col(r, "creditdebet")) ? -1 : 1;
      return {
        date: parseDate(col(r, "transactiedatum"), format),
        amount: Math.abs(parseAmount(col(r, "bedrag"), ",")) * sign,
        currency: col(r, "valutacode") || "EUR",
        counterpartyName: col(r, "tegenrekeninghouder") || null,
        counterpartyIban: normalizeIban(col(r, "tegenrekeningnummer")),
        description: collapseWhitespace(col(r, "omschrijving")),
        txType: col(r, "betaalwijze") || col(r, "type betaling") || null,
        externalId: col(r, "referentie") || null,
        balanceAfter: null,
        accountIban: normalizeIban(col(r, "rekeningnummer")),
      };
    });
  },
};

const isIbanLike = (s: string | undefined) => !!s && /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s.replace(/\s/g, ""));

/** ABN AMRO "TXT" export: tab separated, no header, 8 columns. */
const abnAmro: CsvPreset = {
  id: "abnamro",
  label: "ABN AMRO (TXT)",
  detect: (rows) => {
    const r = rows[0];
    return r && r.length >= 8 && /^[A-Z]{3}$/.test(r[1]?.trim()) && /^\d{8}$/.test(r[2]?.trim()) && /^\d{8}$/.test(r[5]?.trim())
      ? -1
      : null;
  },
  parse(rows) {
    return dataRows(rows, -1).map((r) => {
      const parts = parseAbnDescription(r[7] ?? "");
      return {
        date: parseDate(r[2], "YYYYMMDD"),
        amount: parseAmount(r[6], ","),
        currency: r[1].trim() || "EUR",
        counterpartyName: parts.counterpartyName,
        counterpartyIban: parts.counterpartyIban,
        description: parts.description,
        txType: parts.txType,
        externalId: null,
        balanceAfter: optionalAmount(r[4], ","),
        accountIban: normalizeIban(r[0]),
      };
    });
  },
};

/** ASN Bank, SNS and RegioBank (de Volksbank): comma separated, no header, 19 columns. */
const volksbank: CsvPreset = {
  id: "volksbank",
  label: "ASN / SNS / RegioBank (CSV)",
  detect: (rows) => {
    const r = rows[0];
    return r && r.length >= 18 && /^\d{2}-\d{2}-\d{4}$/.test(r[0]?.trim()) && isIbanLike(r[1]?.trim()) ? -1 : null;
  },
  parse(rows) {
    return dataRows(rows, -1).map((r) => {
      const amount = parseAmount(r[10], ".");
      const before = r[8]?.trim() ? parseAmount(r[8], ".") : null;
      const own = normalizeIban(r[1]);
      return {
        date: parseDate(r[0], "DD-MM-YYYY"),
        amount,
        currency: r[9]?.trim() || "EUR",
        counterpartyName: r[3]?.trim() || null,
        counterpartyIban: normalizeIban(r[2]),
        description: collapseWhitespace((r[17] ?? "").replace(/^'|'$/g, "")),
        txType: r[14]?.trim() || null,
        externalId: r[15]?.trim() ? `${own ?? ""}:${r[15].trim()}` : null,
        balanceAfter: before != null ? before + amount : null,
        accountIban: own,
      };
    });
  },
};

export const CSV_PRESETS: CsvPreset[] = [ing, rabobank, bunq, knab, abnAmro, volksbank];
