import { daysBetween } from "../dates";
import { normalizeIban } from "../text";

export interface TransferLeg {
  id: number;
  accountId: number;
  date: string;
  amount: number;
  counterpartyIban: string | null;
}

export interface OwnAccountSpan {
  id: number;
  iban: string | null;
  /** First and last transaction date in the account, null without transactions. */
  first: string | null;
  last: string | null;
}

export interface UnmatchedTransfer {
  leg: TransferLeg;
  otherAccountId: number;
}

/**
 * Pairs the two sides of transfers between your own accounts (same amount with
 * opposite sign, a few days apart) and returns legs whose counterpart is missing
 * from the other account although its statements cover that date.
 */
export function unmatchedTransfers(legs: TransferLeg[], accounts: OwnAccountSpan[], toleranceDays = 4): UnmatchedTransfer[] {
  const byIban = new Map<string, OwnAccountSpan>();
  for (const a of accounts) {
    const iban = normalizeIban(a.iban);
    if (iban) byIban.set(iban, a);
  }
  const ibanOf = new Map(accounts.map((a) => [a.id, normalizeIban(a.iban)]));
  const byAccount = new Map<number, TransferLeg[]>();
  for (const leg of legs) {
    const list = byAccount.get(leg.accountId) ?? [];
    list.push(leg);
    byAccount.set(leg.accountId, list);
  }

  const used = new Set<number>();
  const out: UnmatchedTransfer[] = [];
  for (const leg of [...legs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    if (used.has(leg.id)) continue;
    const other = byIban.get(normalizeIban(leg.counterpartyIban) ?? "");
    if (!other || other.id === leg.accountId) continue;
    // Can't judge dates the other account's statements don't cover.
    if (!other.first || !other.last || leg.date < other.first || leg.date > other.last) continue;

    const ownIban = ibanOf.get(leg.accountId);
    let best: TransferLeg | null = null;
    for (const c of byAccount.get(other.id) ?? []) {
      if (used.has(c.id) || c.amount !== -leg.amount) continue;
      const cIban = normalizeIban(c.counterpartyIban);
      if (cIban && ownIban && cIban !== ownIban) continue;
      const gap = Math.abs(daysBetween(leg.date, c.date));
      if (gap > toleranceDays) continue;
      if (!best || gap < Math.abs(daysBetween(leg.date, best.date))) best = c;
    }
    used.add(leg.id);
    if (best) used.add(best.id);
    else out.push({ leg, otherAccountId: other.id });
  }
  return out;
}

export interface FlowTx {
  accountId: number;
  date: string;
  amount: number;
  categoryId: number | null;
  counterpartyIban: string | null;
}

/** True when money moves between two accounts you track: neither income nor spending for the household. */
export function isInternal(tx: Pick<FlowTx, "counterpartyIban">, ownIbans: Set<string>): boolean {
  const iban = normalizeIban(tx.counterpartyIban);
  return !!iban && ownIbans.has(iban);
}

/**
 * Money put aside: the balance change of your savings accounts (deposits minus
 * withdrawals, plus interest) and payments into a savings/investments category
 * that go somewhere outside Books, such as a broker. Where a savings account's
 * statements don't cover a date, the transfer seen on the paying side counts.
 */
export function putAside(
  txs: FlowTx[],
  roles: Map<number, string | null>,
  savings: OwnAccountSpan[],
  ownIbans: Set<string>,
): number {
  const savingsIds = new Set(savings.map((a) => a.id));
  const savingsByIban = new Map(savings.filter((a) => a.iban).map((a) => [normalizeIban(a.iban)!, a]));
  let total = 0;
  for (const tx of txs) {
    if (savingsIds.has(tx.accountId)) {
      total += tx.amount;
      continue;
    }
    const target = savingsByIban.get(normalizeIban(tx.counterpartyIban) ?? "");
    if (target) {
      const covered = !!target.first && !!target.last && tx.date >= target.first && tx.date <= target.last;
      if (!covered) total -= tx.amount;
    } else if (!isInternal(tx, ownIbans) && tx.categoryId != null && roles.get(tx.categoryId) === "savings") {
      total -= tx.amount;
    }
  }
  return total;
}

/** Net amount an account moved to savings: to savings accounts or into a savings category. */
export function movedToSavings(
  txs: FlowTx[],
  roles: Map<number, string | null>,
  savingsIbans: Set<string>,
): number {
  let total = 0;
  for (const tx of txs) {
    const iban = normalizeIban(tx.counterpartyIban);
    if ((iban && savingsIbans.has(iban)) || (tx.categoryId != null && roles.get(tx.categoryId) === "savings")) total -= tx.amount;
  }
  return total;
}
