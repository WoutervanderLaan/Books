import { collapseWhitespace, normalizeIban } from "../text";

/** Tags used in structured SEPA descriptions (MT940 :86: fields, ABN AMRO exports). */
const TAGS = [
  "TRTP", "CSID", "NAME", "MARF", "REMI", "IBAN", "BIC", "EREF", "ORDP", "BENM",
  "CNTP", "ULTC", "ULTD", "ULTB", "PURP", "RTRN", "ISDT", "PREF", "SVCL", "ADDR",
  "CHGS", "EXCH", "FEES", "OCMT", "BUSP", "TRCD", "BYOR", "PYID",
];
const TAG_RE = new RegExp(`/(${TAGS.join("|")})/`, "g");

/** Parses "/TRTP/SEPA OVERBOEKING/IBAN/NL../NAME/Foo/REMI/bar/" into a tag map. */
export function parseTaggedFields(text: string): Record<string, string> | null {
  const matches = [...text.matchAll(TAG_RE)];
  if (matches.length < 2) return null;
  const out: Record<string, string> = {};
  matches.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const value = text.slice(start, end).replace(/\/+$/, "").trim();
    if (!(m[1] in out)) out[m[1]] = value;
  });
  return out;
}

export interface DescriptionParts {
  counterpartyName: string | null;
  counterpartyIban: string | null;
  description: string;
  txType: string | null;
}

function remittance(remi: string | undefined): string {
  if (!remi) return "";
  // "USTD//free text" or "STRD/CUR/1234567890"
  return collapseWhitespace(remi.replace(/^USTD\/\//, "").replace(/^STRD\/\w+\//, "").replace(/\/+$/, ""));
}

/** Interprets structured tag fields from MT940 / ABN AMRO descriptions. */
export function fromTaggedFields(fields: Record<string, string>): DescriptionParts {
  let name: string | null = null;
  let iban: string | null = null;
  if (fields.CNTP) {
    // CNTP/account/bic/name/city
    const [account, , cname] = fields.CNTP.split("/");
    iban = normalizeIban(account);
    name = cname?.trim() || null;
  }
  if (fields.IBAN) iban = normalizeIban(fields.IBAN);
  if (fields.NAME) name = fields.NAME.trim();
  if (!name && fields.ULTC) name = fields.ULTC.split("/")[0]?.trim() || null;
  if (!name && fields.ULTD) name = fields.ULTD.split("/")[0]?.trim() || null;
  const description = remittance(fields.REMI) || collapseWhitespace(fields.EREF && fields.EREF !== "NOTPROVIDED" ? fields.EREF : "");
  return {
    counterpartyName: name ? collapseWhitespace(name) : null,
    counterpartyIban: iban,
    description,
    txType: fields.TRTP ? collapseWhitespace(fields.TRTP) : null,
  };
}

/**
 * Parses ABN AMRO style descriptions:
 * - "/TRTP/SEPA OVERBOEKING/IBAN/.../NAME/.../REMI/..." (structured)
 * - "SEPA Overboeking   IBAN: NL..   BIC: ..   Naam: ..   Omschrijving: .."
 * - "BEA, Betaalpas   ALBERT HEIJN 1234,PAS123   NR:..., 31.01.24/12:34   AMSTERDAM"
 */
export function parseAbnDescription(raw: string): DescriptionParts {
  const text = raw.trim();
  const tagged = parseTaggedFields(text);
  if (tagged && (tagged.TRTP || tagged.IBAN || tagged.NAME)) return fromTaggedFields(tagged);

  const sepa = text.match(/^(SEPA[^:]*?)\s{2,}/i);
  if (sepa || /\b(IBAN|Naam):/.test(text)) {
    const field = (label: string) => {
      const m = text.match(
        new RegExp(
          `${label}:\\s*(.+?)(?=\\s{2,}|\\s+(?:IBAN|BIC|Naam|Omschrijving|Kenmerk|Machtiging|Incassant|Voor|Betalingskenm\\.|Machtiging):|$)`,
        ),
      );
      return m ? m[1].trim() : null;
    };
    const omschrijving = text.match(/Omschrijving:\s*(.+?)(?=\s+Kenmerk:|\s{3,}Kenmerk|$)/);
    return {
      counterpartyName: field("Naam"),
      counterpartyIban: normalizeIban(field("IBAN")),
      description: collapseWhitespace(omschrijving ? omschrijving[1] : text),
      txType: sepa ? collapseWhitespace(sepa[1]) : null,
    };
  }

  const card = text.match(/^(BEA|GEA|eCom)[,\s]+(?:Betaalpas|Apple Pay|Google Pay|Garmin Pay|Fitbit Pay)?\s*(.+?)(?:,PAS\d+|\s{2,}|$)/i);
  if (card) {
    const kind = card[1].toUpperCase();
    return {
      counterpartyName: collapseWhitespace(card[2]),
      counterpartyIban: null,
      description: collapseWhitespace(text),
      txType: kind === "GEA" ? "Geldautomaat" : kind === "BEA" ? "Betaalautomaat" : "eCom",
    };
  }

  return { counterpartyName: null, counterpartyIban: null, description: collapseWhitespace(text), txType: null };
}

/** Extracts the "Omschrijving:" part of an ING "Mededelingen" field and drops noise. */
export function cleanIngNotes(notes: string): string {
  const text = collapseWhitespace(notes);
  const m = text.match(
    /(?:Omschrijving|Description):\s*(.*?)(?=\s(?:IBAN|Kenmerk|Reference|Machtiging ID|Mandate ID|Incassant ID|Creditor ID|Valutadatum|Value date|Datum\/Tijd|Date\/time):|$)/,
  );
  if (m && m[1].trim()) return m[1].trim();
  return text.replace(/\s*(Valutadatum|Value date):\s*\S+/g, "").trim();
}
