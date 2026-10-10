import { XMLParser } from "fast-xml-parser";
import { collapseWhitespace, normalizeIban } from "../text";
import { ImportError, type ParseResult, type ParsedTransaction } from "./types";
import { parseAmount, sortChronologically } from "./util";

/* eslint-disable @typescript-eslint/no-explicit-any -- XML nodes are untyped */

const ARRAYS = new Set(["Stmt", "Rpt", "Ntry", "TxDtls", "Bal", "Ustrd"]);

const TX_TYPES: Record<string, string> = {
  POSD: "Card payment",
  POSP: "Card payment",
  CWDL: "Geldautomaat",
  ESDD: "Direct debit",
  BBDD: "Direct debit",
  PMDD: "Direct debit",
  ESCT: "Transfer",
  DMCT: "Transfer",
  ICCT: "Transfer",
  RCDT: "Transfer",
  STDO: "Standing order",
};

const text = (node: any): string => {
  if (node == null) return "";
  if (typeof node === "object") return String(node["#text"] ?? "");
  return String(node);
};

const amountOf = (node: any): { cents: number; currency: string } => ({
  cents: parseAmount(text(node), "."),
  currency: (node && typeof node === "object" && node["@_Ccy"]) || "EUR",
});

const dateOf = (node: any): string => {
  const v = text(node?.Dt) || text(node?.DtTm);
  return v.slice(0, 10);
};

const partyName = (party: any): string =>
  text(party?.Nm) || text(party?.Pty?.Nm) || "";

const partyIban = (acct: any): string | null =>
  normalizeIban(text(acct?.Id?.IBAN) || text(acct?.Id?.Othr?.Id));

/** Parses ISO 20022 camt.053 (statement) and camt.052 (report) XML files. */
export function parseCamt(xml: string): ParseResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    isArray: (name) => ARRAYS.has(name),
  });
  const doc = parser.parse(xml)?.Document;
  const statements: any[] = doc?.BkToCstmrStmt?.Stmt ?? doc?.BkToCstmrAcctRpt?.Rpt ?? [];
  if (!statements.length) throw new ImportError("No statements found in this camt file.");

  const transactions: ParsedTransaction[] = [];
  let closingBalance: ParseResult["closingBalance"] = null;

  for (const stmt of statements) {
    const accountIban = partyIban(stmt.Acct);
    for (const bal of stmt.Bal ?? []) {
      const code = text(bal?.Tp?.CdOrPrtry?.Cd);
      if (code === "CLBD") {
        const { cents } = amountOf(bal.Amt);
        const signed = text(bal.CdtDbtInd) === "DBIT" ? -cents : cents;
        const date = dateOf(bal.Dt);
        if (!closingBalance || date >= closingBalance.date) closingBalance = { date, amount: signed };
      }
    }

    for (const ntry of stmt.Ntry ?? []) {
      const status = text(ntry.Sts?.Cd) || text(ntry.Sts);
      if (status && status !== "BOOK") continue; // skip pending entries
      const { cents, currency } = amountOf(ntry.Amt);
      const debit = text(ntry.CdtDbtInd) === "DBIT";
      const reversal = text(ntry.RvslInd) === "true";
      const sign = debit !== reversal ? -1 : 1;
      const details: any[] = ntry.NtryDtls?.TxDtls ?? [];
      const tx = details[0] ?? {};
      const parties = tx.RltdPties ?? {};
      const counterparty = debit ? parties.Cdtr ?? parties.UltmtCdtr : parties.Dbtr ?? parties.UltmtDbtr;
      const counterAcct = debit ? parties.CdtrAcct : parties.DbtrAcct;

      const remittance = details
        .flatMap((d) => (d.RmtInf?.Ustrd ?? []).map(text))
        .concat(details.map((d) => text(d.RmtInf?.Strd?.CdtrRefInf?.Ref)))
        .filter(Boolean);
      const description =
        remittance.join(" ") || text(tx.AddtlTxInf) || text(ntry.AddtlNtryInf);
      const subFamily = text(ntry.BkTxCd?.Domn?.Fmly?.SubFmlyCd);

      transactions.push({
        date: dateOf(ntry.BookgDt) || dateOf(ntry.ValDt),
        amount: sign * cents,
        currency,
        counterpartyName: collapseWhitespace(partyName(counterparty)) || null,
        counterpartyIban: partyIban(counterAcct),
        description: collapseWhitespace(description),
        txType: TX_TYPES[subFamily] ?? (text(ntry.BkTxCd?.Prtry?.Cd) || null),
        externalId: text(ntry.AcctSvcrRef) || text(ntry.NtryRef) || text(tx.Refs?.AcctSvcrRef) || null,
        balanceAfter: null,
        accountIban,
      });
    }
  }

  return {
    format: "camt053",
    formatLabel: "CAMT.053 (XML)",
    transactions: sortChronologically(transactions),
    closingBalance,
    warnings: [],
  };
}
