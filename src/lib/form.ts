import { parseMoneyInput } from "./format";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export const str = (fd: FormData, key: string): string => (fd.get(key) ?? "").toString().trim();
export const optStr = (fd: FormData, key: string): string | null => str(fd, key) || null;
export const bool = (fd: FormData, key: string): boolean => ["on", "true", "1", "yes"].includes(str(fd, key));

export function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function optNumber(fd: FormData, key: string): number | null {
  const v = str(fd, key).replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Money input in euros ("1.234,56" or "1234.56") to cents. */
export const optMoney = (fd: FormData, key: string): number | null => parseMoneyInput(str(fd, key));

export function oneOf<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isMonth = (v: string) => /^\d{4}-\d{2}$/.test(v);

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
