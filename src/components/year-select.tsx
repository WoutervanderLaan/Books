"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "./ui";

export function YearSelect({ years, value }: { years: number[]; value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      <span>Year</span>
      <Select
        className="w-auto"
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(search.toString());
          next.set("year", e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </label>
  );
}
