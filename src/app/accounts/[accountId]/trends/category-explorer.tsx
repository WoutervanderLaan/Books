"use client";

import { useState } from "react";
import { MonthlyColumns } from "@/components/charts";
import { Select } from "@/components/ui";
import { formatMoney } from "@/lib/format";

export function CategoryExplorer({
  months,
  series,
  categories,
}: {
  months: string[];
  series: Record<string, number[]>;
  categories: { key: string; name: string }[];
}) {
  const [key, setKey] = useState(categories[0]?.key ?? "");
  if (!categories.length) return <p className="text-sm text-muted">No spending yet.</p>;
  const values = series[key] ?? [];
  const data = months.slice(-36).map((month, i) => ({ month, value: values[values.length - Math.min(36, months.length) + i] ?? 0 }));
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const name = categories.find((c) => c.key === key)?.name ?? "";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select className="w-auto min-w-56" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Category">
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </Select>
        <p className="text-sm text-ink-2">
          Average <span className="font-semibold text-ink tabular">{formatMoney(Math.round(avg))}</span> / month
        </p>
      </div>
      <MonthlyColumns data={data} label={name} height={220} />
    </div>
  );
}
