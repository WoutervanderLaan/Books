"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "./ui";

export function NavLink({ href, children, icon, exact }: { href: string; children: ReactNode; icon?: ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm whitespace-nowrap transition-colors",
        active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}

/** Horizontal tab bar for account sections. */
export function TabLink({ href, children, exact }: { href: string; children: ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
        active ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:border-axis hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
