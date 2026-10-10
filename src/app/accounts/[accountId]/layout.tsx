import { BriefcaseBusiness, Wallet } from "lucide-react";
import { TabLink } from "@/components/nav-link";
import { Badge } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { getDb, requireAccount } from "@/lib/server";
import { accountStats } from "@/lib/services/accounts";
import { formatIban } from "@/lib/text";

export default async function AccountLayout({ children, params }: LayoutProps<"/accounts/[accountId]">) {
  const { accountId } = await params;
  const account = requireAccount(accountId);
  const stats = accountStats(getDb(), account);
  const base = `/accounts/${account.id}`;
  const business = account.kind === "business";

  return (
    <>
      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-ink">{account.name}</h1>
              <Badge tone={business ? "accent" : "neutral"}>
                {business ? <BriefcaseBusiness className="size-3" aria-hidden /> : <Wallet className="size-3" aria-hidden />}
                {business ? "Business" : "Personal"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{account.iban ? formatIban(account.iban) : "IBAN not set"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">{stats.lastDate ? `Balance on ${formatDate(stats.lastDate)}` : "Balance"}</p>
            <p className="text-xl font-semibold tracking-tight text-ink">{formatMoney(stats.balance)}</p>
          </div>
        </div>
        <nav className="no-print mt-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Account sections">
          <TabLink href={base} exact>Dashboard</TabLink>
          <TabLink href={`${base}/transactions`}>
            Transactions
            {stats.uncategorised ? (
              <span className="ml-1.5 rounded-full bg-warning px-1.5 text-[11px] font-semibold text-black">{stats.uncategorised}</span>
            ) : null}
          </TabLink>
          <TabLink href={`${base}/import`}>Import</TabLink>
          <TabLink href={`${base}/budget`}>Budget</TabLink>
          <TabLink href={`${base}/trends`}>Trends</TabLink>
          {business ? <TabLink href={`${base}/tax`}>Tax</TabLink> : null}
          <TabLink href={`${base}/rules`}>Rules</TabLink>
          <TabLink href={`${base}/settings`}>Settings</TabLink>
        </nav>
      </header>
      {children}
    </>
  );
}
