/**
 * Dutch income tax parameters for self-employed people (IB-ondernemers), in euros.
 *
 * These change every year. The table below is built in for convenience and can be
 * overridden per year from the Tax settings screen. Always verify against
 * belastingdienst.nl before filing — the app gives an indication, not advice.
 */

export interface Segment {
  /** Upper bound of this segment in euros; null = no upper bound */
  upTo: number | null;
  rate: number;
}

export interface NlTaxParams {
  year: number;
  /** "confirmed": from enacted legislation; "provisional": based on announced plans or copied from a previous year */
  status: "confirmed" | "provisional";
  note?: string;
  vatHigh: number;
  vatLow: number;
  urencriterium: number;
  zelfstandigenaftrek: number;
  startersaftrek: number;
  /** MKB-winstvrijstelling as a fraction */
  mkbWinstvrijstelling: number;
  /** Box 1 brackets for people below state pension (AOW) age */
  box1: Segment[];
  algemeneHeffingskorting: { max: number; phaseOutFrom: number; phaseOutRate: number };
  /** Piecewise linear: each segment adds rate × (part of income in the segment) */
  arbeidskorting: Segment[];
  zvwRate: number;
  zvwMaxIncome: number;
  /** Kleinschaligheidsinvesteringsaftrek */
  kia: { minTotal: number; pctUpTo: number; pct: number; fixedUpTo: number; fixed: number; zeroFrom: number; decreaseRate: number };
  minAssetValue: number;
  kmAllowance: number;
}

const BUILT_IN: NlTaxParams[] = [
  {
    year: 2024,
    status: "confirmed",
    vatHigh: 21,
    vatLow: 9,
    urencriterium: 1225,
    zelfstandigenaftrek: 3750,
    startersaftrek: 2123,
    mkbWinstvrijstelling: 0.1331,
    box1: [
      { upTo: 75518, rate: 0.3697 },
      { upTo: null, rate: 0.495 },
    ],
    algemeneHeffingskorting: { max: 3362, phaseOutFrom: 24812, phaseOutRate: 0.0663 },
    arbeidskorting: [
      { upTo: 11491, rate: 0.08425 },
      { upTo: 24821, rate: 0.31433 },
      { upTo: 39958, rate: 0.02471 },
      { upTo: 124935, rate: -0.0651 },
      { upTo: null, rate: 0 },
    ],
    zvwRate: 0.0532,
    zvwMaxIncome: 71628,
    kia: { minTotal: 2801, pctUpTo: 69765, pct: 0.28, fixedUpTo: 129194, fixed: 19535, zeroFrom: 387580, decreaseRate: 0.0756 },
    minAssetValue: 450,
    kmAllowance: 0.23,
  },
  {
    year: 2025,
    status: "confirmed",
    vatHigh: 21,
    vatLow: 9,
    urencriterium: 1225,
    zelfstandigenaftrek: 2470,
    startersaftrek: 2123,
    mkbWinstvrijstelling: 0.127,
    box1: [
      { upTo: 38441, rate: 0.3582 },
      { upTo: 76817, rate: 0.3748 },
      { upTo: null, rate: 0.495 },
    ],
    algemeneHeffingskorting: { max: 3068, phaseOutFrom: 28406, phaseOutRate: 0.06337 },
    arbeidskorting: [
      { upTo: 12169, rate: 0.08053 },
      { upTo: 26288, rate: 0.3003 },
      { upTo: 43071, rate: 0.02258 },
      { upTo: 129078, rate: -0.0651 },
      { upTo: null, rate: 0 },
    ],
    zvwRate: 0.0526,
    zvwMaxIncome: 75864,
    kia: { minTotal: 2901, pctUpTo: 70602, pct: 0.28, fixedUpTo: 130744, fixed: 19769, zeroFrom: 392230, decreaseRate: 0.0756 },
    minAssetValue: 450,
    kmAllowance: 0.23,
  },
  {
    year: 2026,
    status: "provisional",
    note: "Based on the 2026 tax plan (Belastingplan 2026); KIA amounts copied from 2025. Verify before filing.",
    vatHigh: 21,
    vatLow: 9,
    urencriterium: 1225,
    zelfstandigenaftrek: 1200,
    startersaftrek: 2123,
    mkbWinstvrijstelling: 0.127,
    box1: [
      { upTo: 38883, rate: 0.3575 },
      { upTo: 78426, rate: 0.3756 },
      { upTo: null, rate: 0.495 },
    ],
    algemeneHeffingskorting: { max: 3115, phaseOutFrom: 29736, phaseOutRate: 0.06398 },
    arbeidskorting: [
      { upTo: 11965, rate: 0.08324 },
      { upTo: 25845, rate: 0.31009 },
      { upTo: 45592, rate: 0.0195 },
      { upTo: 132920, rate: -0.0651 },
      { upTo: null, rate: 0 },
    ],
    zvwRate: 0.0485,
    zvwMaxIncome: 79409,
    kia: { minTotal: 2901, pctUpTo: 70602, pct: 0.28, fixedUpTo: 130744, fixed: 19769, zeroFrom: 392230, decreaseRate: 0.0756 },
    minAssetValue: 450,
    kmAllowance: 0.23,
  },
];

export const KNOWN_TAX_YEARS = BUILT_IN.map((p) => p.year);

/** Built-in parameters for a year; unknown years fall back to the nearest known year. */
export function builtInParams(year: number): NlTaxParams {
  const exact = BUILT_IN.find((p) => p.year === year);
  if (exact) return structuredClone(exact);
  const nearest = year < BUILT_IN[0].year ? BUILT_IN[0] : BUILT_IN[BUILT_IN.length - 1];
  return {
    ...structuredClone(nearest),
    year,
    status: "provisional",
    note: `No parameters built in for ${year}; using ${nearest.year}. Update them in the tax settings.`,
  };
}

export type ParamUnit = "eur" | "pct" | "hours";

export interface ParamField {
  path: string;
  label: string;
  unit: ParamUnit;
}

/** Editable scalar parameters (paths into NlTaxParams). */
export function paramFields(p: NlTaxParams): ParamField[] {
  const fields: ParamField[] = [
    { path: "urencriterium", label: "Hours criterion (urencriterium)", unit: "hours" },
    { path: "zelfstandigenaftrek", label: "Zelfstandigenaftrek", unit: "eur" },
    { path: "startersaftrek", label: "Startersaftrek", unit: "eur" },
    { path: "mkbWinstvrijstelling", label: "MKB-winstvrijstelling", unit: "pct" },
  ];
  p.box1.forEach((b, i) => {
    if (b.upTo != null) fields.push({ path: `box1.${i}.upTo`, label: `Box 1 bracket ${i + 1} up to`, unit: "eur" });
    fields.push({ path: `box1.${i}.rate`, label: `Box 1 bracket ${i + 1} rate`, unit: "pct" });
  });
  fields.push(
    { path: "algemeneHeffingskorting.max", label: "General tax credit (max)", unit: "eur" },
    { path: "algemeneHeffingskorting.phaseOutFrom", label: "General tax credit phase-out from", unit: "eur" },
    { path: "algemeneHeffingskorting.phaseOutRate", label: "General tax credit phase-out rate", unit: "pct" },
  );
  p.arbeidskorting.forEach((s, i) => {
    if (s.upTo != null) fields.push({ path: `arbeidskorting.${i}.upTo`, label: `Labour tax credit step ${i + 1} up to`, unit: "eur" });
    fields.push({ path: `arbeidskorting.${i}.rate`, label: `Labour tax credit step ${i + 1} rate`, unit: "pct" });
  });
  fields.push(
    { path: "zvwRate", label: "Zvw contribution rate", unit: "pct" },
    { path: "zvwMaxIncome", label: "Zvw maximum income", unit: "eur" },
    { path: "kia.minTotal", label: "KIA minimum total investment", unit: "eur" },
    { path: "kia.pctUpTo", label: "KIA percentage applies up to", unit: "eur" },
    { path: "kia.pct", label: "KIA percentage", unit: "pct" },
    { path: "kia.fixed", label: "KIA fixed amount", unit: "eur" },
    { path: "kia.fixedUpTo", label: "KIA fixed amount up to", unit: "eur" },
    { path: "kia.zeroFrom", label: "KIA zero from", unit: "eur" },
    { path: "kia.decreaseRate", label: "KIA phase-out rate", unit: "pct" },
    { path: "minAssetValue", label: "Minimum asset value", unit: "eur" },
  );
  return fields;
}

export function getPath(obj: unknown, path: string): number {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj) as number;
}

function setPath(obj: unknown, path: string, value: number) {
  const keys = path.split(".");
  let o = obj as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) {
    if (o[k] == null || typeof o[k] !== "object") return;
    o = o[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (last in o) o[last] = value;
}

/** Built-in parameters with the user's overrides applied. */
export function resolveParams(year: number, overrides?: Record<string, unknown> | null): NlTaxParams {
  const params = builtInParams(year);
  if (overrides) {
    for (const [path, value] of Object.entries(overrides)) {
      if (typeof value === "number" && Number.isFinite(value)) setPath(params, path, value);
    }
  }
  return params;
}
