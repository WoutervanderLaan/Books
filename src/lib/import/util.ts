import type { DateFormat } from "../types";
import { ImportError } from "./types";

/** Decodes a file as UTF-8, falling back to Windows-1252 (common for Dutch bank exports). */
export function decodeBuffer(buf: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("windows-1252").decode(buf);
  }
  return text.replace(/^﻿/, "");
}

/**
 * Parses a money string into signed cents. Handles "1.234,56", "1,234.56",
 * "-12,34", "+12.34", "12" and "€ 12,00". `decimal` forces the decimal separator.
 */
export function parseAmount(raw: string, decimal?: "," | "."): number {
  let s = raw.trim().replace(/[€\s]|EUR/gi, "");
  if (!s) throw new ImportError(`Empty amount`);
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }

  let dec = decimal;
  if (!dec) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma >= 0 && lastDot >= 0) dec = lastComma > lastDot ? "," : ".";
    else if (lastComma >= 0) dec = /^\d{1,3}(,\d{3}){2,}$/.test(s) ? "." : ",";
    else if (lastDot >= 0) dec = /^\d{1,3}(\.\d{3})+$/.test(s) ? "," : ".";
    else dec = ".";
  }
  const thousands = dec === "," ? "." : ",";
  s = s.split(thousands).join("");
  if (dec === ",") s = s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new ImportError(`Not an amount: "${raw}"`);
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  // Round half up on a third decimal, if any
  const extra = frac.length > 2 && Number(frac[2]) >= 5 ? 1 : 0;
  const value = cents + extra;
  return negative ? -value : value;
}

const pad = (n: number) => String(n).padStart(2, "0");

function ymd(y: number, m: number, d: number, raw: string): string {
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new ImportError(`Invalid date "${raw}"`);
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Parses a date string in the given format into YYYY-MM-DD. */
export function parseDate(raw: string, format: DateFormat): string {
  const s = raw.trim().split(/[ T]/)[0];
  let m: RegExpMatchArray | null;
  switch (format) {
    case "YYYY-MM-DD":
      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) return ymd(+m[1], +m[2], +m[3], raw);
      break;
    case "YYYYMMDD":
      m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (m) return ymd(+m[1], +m[2], +m[3], raw);
      break;
    case "DD-MM-YYYY":
      m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
      if (m) return ymd(+m[3], +m[2], +m[1], raw);
      break;
    case "DD/MM/YYYY":
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (m) return ymd(+m[3], +m[2], +m[1], raw);
      break;
    case "MM/DD/YYYY":
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (m) return ymd(+m[3], +m[1], +m[2], raw);
      break;
    case "DD.MM.YYYY":
      m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
      if (m) return ymd(+m[3], +m[2], +m[1], raw);
      break;
  }
  throw new ImportError(`Date "${raw}" does not match format ${format}`);
}

/** Guesses the date format from sample values. */
export function guessDateFormat(samples: string[]): DateFormat | null {
  const values = samples.map((s) => s.trim()).filter(Boolean);
  if (!values.length) return null;
  const candidates: DateFormat[] = [
    "YYYY-MM-DD",
    "YYYYMMDD",
    "DD-MM-YYYY",
    "DD/MM/YYYY",
    "DD.MM.YYYY",
    "MM/DD/YYYY",
  ];
  for (const format of candidates) {
    if (
      values.every((v) => {
        try {
          parseDate(v, format);
          return true;
        } catch {
          return false;
        }
      })
    ) {
      return format;
    }
  }
  return null;
}

/** Sorts transactions oldest first while keeping the bank's order within a day. */
export function sortChronologically<T extends { date: string }>(rows: T[]): T[] {
  if (rows.length < 2) return rows;
  // Exports are often newest first; reverse so same-day order becomes chronological.
  const ordered = rows[0].date > rows[rows.length - 1].date ? [...rows].reverse() : [...rows];
  return ordered
    .map((row, i) => ({ row, i }))
    .sort((a, b) => (a.row.date < b.row.date ? -1 : a.row.date > b.row.date ? 1 : a.i - b.i))
    .map(({ row }) => row);
}

/** Closing balance from the last transaction that carries a balance. */
export function closingFromRows(
  rows: { date: string; balanceAfter: number | null }[],
): { date: string; amount: number } | null {
  const last = rows[rows.length - 1];
  if (!last || last.balanceAfter == null) return null;
  return { date: last.date, amount: last.balanceAfter };
}
