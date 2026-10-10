import Link from "next/link";
import { BriefcaseBusiness, FolderTree, House, Plus, Settings, Wallet } from "lucide-react";
import { getDb } from "@/lib/server";
import { listAccounts } from "@/lib/services/accounts";
import { NavLink } from "./nav-link";

export function Sidebar() {
  const accounts = listAccounts(getDb());
  const personal = accounts.filter((a) => a.kind === "personal");
  const business = accounts.filter((a) => a.kind === "business");

  return (
    <aside className="no-print border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex items-center justify-between px-4 py-4 md:block">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-on-accent">
            <Wallet className="size-4" aria-hidden />
          </span>
          Books
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-5 md:overflow-visible md:pb-6">
        <div className="flex gap-1 md:block md:space-y-0.5">
          <NavLink href="/" exact icon={<House className="size-4" aria-hidden />}>
            Overview
          </NavLink>
        </div>
        <NavSection title="Personal" items={personal} icon={<Wallet className="size-4" aria-hidden />} />
        <NavSection title="Business" items={business} icon={<BriefcaseBusiness className="size-4" aria-hidden />} />
        <div className="flex gap-1 md:block md:space-y-0.5">
          <NavLink href="/accounts/new" icon={<Plus className="size-4" aria-hidden />}>
            Add account
          </NavLink>
          <NavLink href="/categories" icon={<FolderTree className="size-4" aria-hidden />}>
            Categories
          </NavLink>
          <NavLink href="/settings" icon={<Settings className="size-4" aria-hidden />}>
            Data & backup
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}

function NavSection({ title, items, icon }: { title: string; items: { id: number; name: string }[]; icon: React.ReactNode }) {
  if (!items.length) return null;
  return (
    <div className="flex gap-1 md:block md:space-y-0.5">
      <p className="hidden px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase md:block">{title}</p>
      {items.map((a) => (
        <NavLink key={a.id} href={`/accounts/${a.id}`} icon={icon}>
          {a.name}
        </NavLink>
      ))}
    </div>
  );
}
