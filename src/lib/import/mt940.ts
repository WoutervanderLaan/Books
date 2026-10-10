import { collapseWhitespace, normalizeIban } from "../text";
import { fromTaggedFields, parseAbnDescription, parseTaggedFields } from "./descriptions";
import { ImportError, type ParseResult, type ParsedTransaction } from "./types";
import { parseAmount, sortChronologically } from "./util";

interface Field {
  tag: string;
  value: string;
}

/** Splits an MT940 file into ":XX:" fields, joining continuation lines. */
function fields(text: string): Field[] {
  const out: Field[] = [];
  let previousLength = 0;
  for (const line of text.split(/\r?\n/)) {
    // MT940 wraps lines at 65 characters: a full line continues mid-word on the next one,
    // so its trailing spaces are content. Shorter lines are padded fields.
    const full = line.length >= 65;
    const content = full ? line : line.trimEnd();
    const trimmed = content.trim();
    if (!trimmed || trimmed === "-" || trimmed.startsWith("{") || trimmed.startsWith("-}")) {
      previousLength = 0;
      continue;
    }
    const m = content.match(/^:(\d{2}[A-Z]?):(.*)$/);
    if (m) out.push({ tag: m[1], value: m[2] });
    else if (out.length) {
      out[out.length - 1].value += previousLength >= 65 ? content : ` ${trimmed}`;
    }
    previousLength = line.length;
  }
  return out.map((f) => ({ ...f, value: f.value.trim() }));
}

const yymmdd = (s: string) => `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;

function parseBalance(value: string): { date: string; amount: number } | null {
  const m = value.match(/^([CD])(\d{6})([A-Z]{3})([\d,]+)/);
  if (!m) return null;
  const cents = parseAmount(m[4], ",");
  return { date: yymmdd(m[2]), amount: m[1] === "D" ? -cents : cents };
}

function accountIban(value: string): string | null {
  const nl = value.match(/[A-Z]{2}\d{2}[A-Z]{4}\d{10}/);
  if (nl) return nl[0];
  const generic = value.replace(/\s/g, "").match(/[A-Z]{2}\d{2}[A-Z0-9]{10,30}/);
  return normalizeIban(generic?.[0]?.replace(/EUR$/, ""));
}

/** Parses SWIFT MT940 statements (ING, Rabobank, ABN AMRO, Triodos, ...). */
export function parseMt940(text: string): ParseResult {
  const all = fields(text);
  if (!all.some((f) => f.tag === "61")) throw new ImportError("No transactions (:61:) found in MT940 file.");

  const transactions: ParsedTransaction[] = [];
  let iban: string | null = null;
  let currency = "EUR";
  let closingBalance: ParseResult["closingBalance"] = null;
  let current: ParsedTransaction | null = null;

  const flush = () => {
    if (current) transactions.push(current);
    current = null;
  };

  for (const f of all) {
    switch (f.tag) {
      case "25":
        iban = accountIban(f.value);
        break;
      case "60F":
      case "60M": {
        const m = f.value.match(/^[CD]\d{6}([A-Z]{3})/);
        if (m) currency = m[1];
        break;
      }
      case "61": {
        flush();
        const line = f.value;
        const m = line.match(/^(\d{6})(\d{4})?(RC|RD|C|D)([A-Z])?([\d,]+)([A-Z][A-Z0-9]{3})(.*)$/);
        if (!m) throw new ImportError(`Unreadable :61: line "${line}"`);
        const cents = parseAmount(m[5], ",");
        const negative = m[3] === "D" || m[3] === "RC";
        current = {
          date: yymmdd(m[1]),
          amount: negative ? -cents : cents,
          currency,
          counterpartyName: null,
          counterpartyIban: null,
          description: "",
          txType: null,
          externalId: null,
          balanceAfter: null,
          accountIban: iban,
        };
        break;
      }
      case "86": {
        if (!current) break;
        const tx: ParsedTransaction = current;
        const info = f.value;
        const tagged = parseTaggedFields(info);
        const parts = tagged ? fromTaggedFields(tagged) : parseAbnDescription(info);
        tx.counterpartyName = parts.counterpartyName;
        tx.counterpartyIban = parts.counterpartyIban;
        tx.description = parts.description || collapseWhitespace(info);
        tx.txType = parts.txType;
        break;
      }
      case "62F":
      case "62M": {
        flush();
        const bal = parseBalance(f.value);
        if (bal && (!closingBalance || bal.date >= closingBalance.date)) closingBalance = bal;
        break;
      }
    }
  }
  flush();

  return {
    format: "mt940",
    formatLabel: "MT940",
    transactions: sortChronologically(transactions),
    closingBalance,
    warnings: [],
  };
}
