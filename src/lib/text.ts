/**
 * Normalises free text for matching: lowercase, accents stripped, every
 * non-alphanumeric character becomes a space. "AH to go 5832" -> "ah to go 5832",
 * "bol.com" -> "bol com".
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Whole-word containment on normalised text. */
export function containsWords(haystack: string, needle: string): boolean {
  const n = normalizeText(needle);
  if (!n) return false;
  return ` ${normalizeText(haystack)} `.includes(` ${n} `);
}

/** Uppercase IBAN without spaces, or null if it doesn't look like an account number. */
export function normalizeIban(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.replace(/\s+/g, "").toUpperCase();
  if (!v || /^0+$/.test(v)) return null;
  return v;
}

export function formatIban(iban: string | null | undefined): string {
  if (!iban) return "";
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
