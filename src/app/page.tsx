import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, FileUp, ListChecks, LockKeyhole, PieChart, Wallet } from "lucide-react";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { getDb } from "@/lib/server";
import { accountStats, listAccounts } from "@/lib/services/accounts";
import { listImports } from "@/lib/services/imports";
import { formatIban } from "@/lib/text";

export default function HomePage() {
  const db = getDb();
  const accounts = listAccounts(db).map((account) => ({
    account,
    stats: accountStats(db, account),
    lastImport: listImports(db, account.id)[0] ?? null,
  }));

  if (!accounts.length) return <Welcome />;

  const personal = accounts.filter((a) => a.account.kind === "personal");
  const totalPersonal = personal.reduce((s, a) => s + a.stats.balance, 0);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Your accounts at a glance. Import last month's transactions, review what couldn't be categorised, then check the dashboard."
        actions={<LinkButton href="/accounts/new">Add account</LinkButton>}
      />
      {personal.length > 1 ? (
        <p className="mb-4 text-sm text-ink-2">
          Combined personal balance <span className="font-semibold text-ink tabular">{formatMoney(totalPersonal)}</span>
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map(({ account, stats, lastImport }) => (
          <Card key={account.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/accounts/${account.id}`} className="block truncate text-[15px] font-semibold text-ink hover:underline">
                  {account.name}
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted">{account.iban ? formatIban(account.iban) : "No IBAN yet"}</p>
              </div>
              <Badge tone={account.kind === "business" ? "accent" : "neutral"}>
                {account.kind === "business" ? <BriefcaseBusiness className="size-3" aria-hidden /> : <Wallet className="size-3" aria-hidden />}
                {account.kind === "business" ? "Business" : "Personal"}
              </Badge>
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-ink">{formatMoney(stats.balance)}</p>
            <p className="text-xs text-muted">
              {stats.lastDate ? `Balance as of ${formatDate(stats.lastDate)}` : "No transactions yet"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <Badge>{stats.transactionCount} transactions</Badge>
              {stats.uncategorised ? (
                <Link href={`/accounts/${account.id}/transactions?category=none`}>
                  <Badge tone="warning">{stats.uncategorised} to review</Badge>
                </Link>
              ) : stats.transactionCount ? (
                <Badge tone="good">All categorised</Badge>
              ) : null}
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 pt-5">
              <span className="text-xs text-muted">
                {lastImport ? `Last import ${formatDate(lastImport.importedAt.slice(0, 10))}` : "Never imported"}
              </span>
              <div className="flex gap-2">
                <LinkButton href={`/accounts/${account.id}/import`} size="sm" variant="ghost">
                  <FileUp className="size-3.5" aria-hidden /> Import
                </LinkButton>
                <LinkButton href={`/accounts/${account.id}`} size="sm">
                  Open <ArrowRight className="size-3.5" aria-hidden />
                </LinkButton>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function Welcome() {
  const steps = [
    { icon: <Wallet className="size-5" aria-hidden />, title: "Add your accounts", text: "One per bank account. Mark each as personal or business — business accounts get VAT and income tax tools." },
    { icon: <FileUp className="size-5" aria-hidden />, title: "Import a bank export", text: "CAMT.053, MT940 or the CSV/TXT export of ING, Rabobank, ABN AMRO, bunq, Knab, ASN/SNS — or any CSV." },
    { icon: <ListChecks className="size-5" aria-hidden />, title: "Categorise once", text: "Common Dutch merchants are recognised. When you categorise a payee, it's remembered for next month." },
    { icon: <PieChart className="size-5" aria-hidden />, title: "Compare and improve", text: "Add your budget (or import it from Excel) and see actual vs. planned, year-over-year changes and subscriptions." },
  ];
  return (
    <div className="mx-auto max-w-3xl py-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Welcome to Books</h1>
      <p className="mt-2 text-ink-2">
        A private finance dashboard that runs on your own computer. Your bank data is stored in a single local file and never leaves this machine.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {steps.map((s) => (
          <Card key={s.title} className="p-5">
            <div className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">{s.icon}</div>
            <p className="mt-3 font-semibold text-ink">{s.title}</p>
            <p className="mt-1 text-sm text-ink-2">{s.text}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <LinkButton href="/accounts/new" variant="primary">
          Add your first account <ArrowRight className="size-4" aria-hidden />
        </LinkButton>
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <LockKeyhole className="size-4" aria-hidden /> Stored locally in <code className="font-mono text-xs">data/finance.db</code>
        </span>
      </div>
    </div>
  );
}
