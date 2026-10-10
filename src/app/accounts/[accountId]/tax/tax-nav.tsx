"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/components/ui";

const SECTIONS = [
  ["", "Profit & income tax"],
  ["/vat", "VAT returns"],
  ["/hours", "Hours"],
  ["/assets", "Assets"],
  ["/settings", "Tax settings"],
] as const;

export function TaxNav({ base }: { base: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const year = search.get("year");
  const qs = year ? `?year=${year}` : "";
  return (
    <nav className="no-print flex flex-wrap gap-1" aria-label="Tax sections">
      {SECTIONS.map(([path, label]) => {
        const href = `${base}${path}`;
        const active = pathname === href;
        return (
          <Link
            key={path}
            href={`${href}${qs}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-sm transition-colors",
              active ? "bg-ink font-medium text-surface" : "bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
