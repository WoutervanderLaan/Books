"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "./ui";

/** Period filter: one control above everything it scopes, stored in the URL. */
export function PeriodSelect({ options, value, param = "period" }: { options: { key: string; label: string }[]; value: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      <span>Period</span>
      <Select
        className="w-auto min-w-44"
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(search.toString());
          next.set(param, e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
