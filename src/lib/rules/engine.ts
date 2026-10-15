import { containsWords, normalizeIban, normalizeText } from "../text";
import type { AccountKind, CategoryKind, CategoryRole, CategoryScope, Direction, RuleSource, VatCode } from "../types";

export interface RuleLike {
  id: number;
  accountId: number | null;
  accountKind: AccountKind | null;
  counterpartyContains: string | null;
  descriptionContains: string | null;
  counterpartyIban: string | null;
  direction: Direction | null;
  amountMin: number | null;
  amountMax: number | null;
  categoryId: number;
  vatCode: VatCode | null;
  priority: number;
  enabled: boolean;
  source: RuleSource;
}

export interface TxLike {
  amount: number;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  description: string;
  txType?: string | null;
}

export interface AccountLike {
  id: number;
  kind: AccountKind;
  iban: string | null;
}

export interface CategoryLike {
  id: number;
  kind: CategoryKind;
  scope: CategoryScope;
  role: CategoryRole | null;
  archived?: boolean;
}

export function ruleAppliesTo(rule: RuleLike, account: AccountLike): boolean {
  if (!rule.enabled) return false;
  if (rule.accountId != null) return rule.accountId === account.id;
  return rule.accountKind == null || rule.accountKind === account.kind;
}

export function conditionCount(rule: RuleLike): number {
  return [
    rule.counterpartyContains,
    rule.descriptionContains,
    rule.counterpartyIban,
    rule.direction,
    rule.amountMin,
    rule.amountMax,
  ].filter((v) => v != null && v !== "").length;
}

/** True when every condition set on the rule matches the transaction. */
export function ruleMatches(rule: RuleLike, tx: TxLike): boolean {
  if (conditionCount(rule) === 0) return false;
  if (rule.counterpartyContains && !containsWords(tx.counterpartyName ?? "", rule.counterpartyContains)) return false;
  if (rule.descriptionContains) {
    const text = `${tx.description} ${tx.txType ?? ""} ${tx.counterpartyName ?? ""}`;
    if (!containsWords(text, rule.descriptionContains)) return false;
  }
  if (rule.counterpartyIban && normalizeIban(rule.counterpartyIban) !== normalizeIban(tx.counterpartyIban)) return false;
  if (rule.direction === "in" && tx.amount < 0) return false;
  if (rule.direction === "out" && tx.amount >= 0) return false;
  const abs = Math.abs(tx.amount);
  if (rule.amountMin != null && abs < rule.amountMin) return false;
  if (rule.amountMax != null && abs > rule.amountMax) return false;
  return true;
}

const SOURCE_RANK: Record<RuleSource, number> = { user: 2, auto: 2, starter: 1 };

/** Orders rules by precedence: your own rules first, then priority, then the most specific. */
export function sortRules<R extends RuleLike>(rules: R[]): R[] {
  const patternLength = (r: RuleLike) =>
    (r.counterpartyContains?.length ?? 0) + (r.descriptionContains?.length ?? 0) + (r.counterpartyIban ? 30 : 0);
  return [...rules].sort(
    (a, b) =>
      SOURCE_RANK[b.source] - SOURCE_RANK[a.source] ||
      b.priority - a.priority ||
      conditionCount(b) - conditionCount(a) ||
      patternLength(b) - patternLength(a) ||
      b.id - a.id,
  );
}

/** Whether a category kind makes sense for money in (amount ≥ 0) or out. Transfers fit both. */
export function kindFitsAmount(kind: CategoryKind, amount: number): boolean {
  if (kind === "transfer") return true;
  return kind === "income" ? amount >= 0 : amount < 0;
}

/**
 * Whether a rule may assign its category to this transaction. A rule without an
 * explicit direction only fires when its category fits the sign, so a salary rule
 * doesn't catch a payment to your employer. Rules with a direction (e.g. refunds
 * into an expense category) are taken at their word.
 */
export function ruleFitsSign(rule: Pick<RuleLike, "direction" | "categoryId">, tx: Pick<TxLike, "amount">, kinds?: Map<number, CategoryKind>): boolean {
  if (rule.direction != null || !kinds) return true;
  const kind = kinds.get(rule.categoryId);
  return !kind || kindFitsAmount(kind, tx.amount);
}

export function findMatchingRule<R extends RuleLike>(
  sortedRules: R[],
  tx: TxLike,
  account: AccountLike,
  kinds?: Map<number, CategoryKind>,
): R | null {
  for (const rule of sortedRules) {
    if (ruleAppliesTo(rule, account) && ruleMatches(rule, tx) && ruleFitsSign(rule, tx, kinds)) return rule;
  }
  return null;
}

/**
 * Recognises transfers between your own accounts and returns the matching
 * transfer category: internal transfer, owner's draw, or private deposit.
 */
export function detectOwnTransfer(
  tx: TxLike,
  account: AccountLike,
  ownAccounts: AccountLike[],
  categories: CategoryLike[],
): number | null {
  const iban = normalizeIban(tx.counterpartyIban);
  if (!iban) return null;
  const other = ownAccounts.find((a) => a.id !== account.id && normalizeIban(a.iban) === iban);
  if (!other) return null;

  const pick = (scope: AccountKind, role: CategoryRole, kind?: CategoryKind) =>
    categories.find((c) => !c.archived && c.scope === scope && c.role === role && (!kind || c.kind === kind))?.id ??
    null;

  if (account.kind === other.kind) return pick(account.kind, "internal_transfer");
  if (account.kind === "business") return pick("business", "private");
  // Personal account <-> own business account
  return tx.amount >= 0 ? pick("personal", "private", "income") : pick("personal", "private", "transfer");
}

// --- Suggesting a rule from a manual categorisation ---------------------------------

/** Payment providers whose counterparty name says nothing about the actual merchant. */
const PROCESSORS = [
  "paypal", "mollie", "adyen", "stripe", "tikkie", "buckaroo", "multisafepay", "klarna",
  "afterpay", "riverty", "pay nl", "worldline", "icepay", "payvision", "ccv", "sumup", "zettle",
];

/** Counterparties that receive very different kinds of payments. */
const MULTI_PURPOSE = ["belastingdienst", "gemeente", "cjib", "duo", "svb", "uwv"];

const LEGAL_SUFFIXES = new Set([
  "bv", "b", "v", "nv", "n", "vof", "cv", "ltd", "limited", "gmbh", "inc", "llc", "sarl", "sa", "ab", "as", "plc", "ag", "srl",
]);

const STOPWORDS = new Set([
  "omschrijving", "naam", "iban", "bic", "kenmerk", "betaling", "betalingskenmerk", "machtiging", "id",
  "incassant", "via", "ref", "referentie", "transactie", "term", "pasvolgnr", "apple", "pay", "google",
  "valutadatum", "europe", "et", "cie", "nl", "eur", "the", "van", "de", "het", "een", "en", "for", "of",
  "payment", "order", "bestelling", "factuur", "invoice", "nr", "no", "to", "from", "bij", "voor", "aan",
  "sca", "s", "a", "r", "l", "c", "www", "com", "https", "online", "ideal", "betaalverzoek",
  ...PROCESSORS.flatMap((p) => p.split(" ")),
]);

function isProcessor(normalizedName: string): string | null {
  return PROCESSORS.find((p) => ` ${normalizedName} `.includes(` ${p} `)) ?? null;
}

/** Stable "who is this" key from a counterparty name: "Albert Heijn 1403 AMSTERDAM" -> "albert heijn". */
export function merchantKey(name: string | null | undefined): string {
  const tokens = normalizeText(name).split(" ").filter(Boolean);
  const kept: string[] = [];
  for (const t of tokens) {
    if (/\d/.test(t)) {
      if (kept.length) break;
      continue;
    }
    kept.push(t);
  }
  while (kept.length > 1 && LEGAL_SUFFIXES.has(kept[kept.length - 1])) kept.pop();
  return kept.slice(0, 4).join(" ");
}

/** A few meaningful words from a description, skipping numbers and filler. */
export function descriptionKey(description: string | null | undefined, maxWords = 2): string {
  return normalizeText(description)
    .split(" ")
    .filter((t) => t.length > 1 && !/\d/.test(t) && !STOPWORDS.has(t))
    .slice(0, maxWords)
    .join(" ");
}

export interface RuleSuggestion {
  counterpartyContains: string | null;
  descriptionContains: string | null;
  counterpartyIban: string | null;
}

/**
 * Proposes rule conditions that will catch the same kind of transaction next month.
 * Returns null when there's nothing reliable to match on.
 */
export function suggestRule(tx: TxLike): RuleSuggestion | null {
  const name = normalizeText(tx.counterpartyName);
  const processor = isProcessor(name);
  const key = merchantKey(tx.counterpartyName);

  if (processor) {
    // "PAYPAL *SPOTIFY" carries the merchant in the name; plain "PayPal Europe" doesn't.
    const rest = key.split(" ").filter((t) => !STOPWORDS.has(t) && !LEGAL_SUFFIXES.has(t));
    if (rest.length) return { counterpartyContains: key, descriptionContains: null, counterpartyIban: null };
    const desc = descriptionKey(tx.description);
    if (!desc) return null;
    return { counterpartyContains: processor, descriptionContains: desc, counterpartyIban: null };
  }

  if (MULTI_PURPOSE.some((m) => ` ${name} `.includes(` ${m} `))) {
    const desc = descriptionKey(tx.description);
    return { counterpartyContains: key || null, descriptionContains: desc || null, counterpartyIban: null };
  }

  const iban = normalizeIban(tx.counterpartyIban);
  if (iban) return { counterpartyContains: null, descriptionContains: null, counterpartyIban: iban };
  if (key) return { counterpartyContains: key, descriptionContains: null, counterpartyIban: null };
  const desc = descriptionKey(tx.description, 3);
  return desc ? { counterpartyContains: null, descriptionContains: desc, counterpartyIban: null } : null;
}

/** Grouping key for "the same payee" used by recurring-payment detection. */
export function counterpartyKey(tx: TxLike): string {
  const s = suggestRule(tx);
  if (!s) return `desc:${normalizeText(tx.description).slice(0, 40)}`;
  return [s.counterpartyIban ?? "", s.counterpartyContains ?? "", s.descriptionContains ?? ""].join("|");
}

export function describeRule(rule: Pick<RuleLike, "counterpartyContains" | "descriptionContains" | "counterpartyIban" | "direction" | "amountMin" | "amountMax">): string {
  const parts: string[] = [];
  if (rule.counterpartyContains) parts.push(`counterparty "${rule.counterpartyContains}"`);
  if (rule.counterpartyIban) parts.push(`IBAN ${rule.counterpartyIban}`);
  if (rule.descriptionContains) parts.push(`description "${rule.descriptionContains}"`);
  if (rule.direction) parts.push(rule.direction === "in" ? "money in" : "money out");
  if (rule.amountMin != null || rule.amountMax != null) {
    const f = (c: number | null) => (c == null ? "…" : `€${(c / 100).toFixed(2)}`);
    parts.push(`amount ${f(rule.amountMin)}–${f(rule.amountMax)}`);
  }
  return parts.join(" + ");
}
