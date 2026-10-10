import { normalizeText } from "../text";
import type { BudgetFrequency, BudgetType } from "../types";

interface NamedCategory {
  id: number;
  name: string;
  groupName: string;
}

/** Finds the category whose name best matches free text from a spreadsheet. */
export function matchCategory<C extends NamedCategory>(text: string, cats: C[]): C | null {
  const t = normalizeText(text);
  if (!t) return null;
  return (
    cats.find((c) => normalizeText(c.name) === t) ??
    cats.find((c) => {
      const n = normalizeText(c.name);
      return n.includes(t) || t.includes(n);
    }) ??
    cats.find((c) => normalizeText(c.groupName) === t) ??
    null
  );
}

const FREQUENCY_WORDS: [RegExp, BudgetFrequency][] = [
  [/^(m|mnd|maand|maandelijks|month|monthly|per maand|pm|p\/m)$/, "monthly"],
  [/^(q|kw|kwartaal|quarter|quarterly|per kwartaal)$/, "quarterly"],
  [/^(j|y|jaar|jaarlijks|year|yearly|annual|annually|per jaar|pj|p\/j)$/, "yearly"],
];

export function parseFrequency(text: string | undefined): BudgetFrequency | null {
  const t = (text ?? "").trim().toLowerCase();
  return FREQUENCY_WORDS.find(([re]) => re.test(t))?.[1] ?? null;
}

export function parseBudgetType(text: string | undefined): BudgetType | null {
  const t = (text ?? "").trim().toLowerCase();
  if (/^(vast|vaste|fixed|f)$/.test(t)) return "fixed";
  if (/^(variabel|variable|schatting|estimate|var|v)$/.test(t)) return "variable";
  return null;
}
