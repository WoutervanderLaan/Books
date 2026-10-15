import { Download } from "lucide-react";
import { CategoryOptions } from "@/components/category-options";
import { Card, Input, LinkButton, Select, buttonClass } from "@/components/ui";
import { getDb, requireAccount } from "@/lib/server";
import { categoriesFor } from "@/lib/services/accounts";
import { queryTransactions } from "@/lib/services/transactions";
import { AddTransactionForm } from "./add-transaction-form";
import { TransactionTable } from "./transaction-table";

export const metadata = { title: "Transactions" };

const PAGE_SIZE = 100;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function TransactionsPage({ params, searchParams }: PageProps<"/accounts/[accountId]/transactions">) {
  const { accountId } = await params;
  const sp = await searchParams;
  const account = requireAccount(accountId);
  const db = getDb();
  const categories = categoriesFor(db, account.kind);

  const categoryParam = one(sp.category);
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);
  const filter = {
    accountId: account.id,
    from: one(sp.from),
    to: one(sp.to),
    category: categoryParam === "none" ? ("none" as const) : categoryParam ? Number(categoryParam) : undefined,
    search: one(sp.q),
    direction: one(sp.dir) === "in" ? ("in" as const) : one(sp.dir) === "out" ? ("out" as const) : undefined,
    sort: (one(sp.sort) as "date_desc" | "date_asc" | "amount_asc" | "amount_desc" | undefined) ?? "date_desc",
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
  const { rows, total } = queryTransactions(db, filter);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    next.set("page", String(n));
    return `?${next.toString()}`;
  };

  return (
    <div className="space-y-4">
      <form className="no-print flex flex-wrap items-end gap-2" method="get">
        <label className="min-w-52 flex-1">
          <span className="mb-1 block text-xs text-muted">Search</span>
          <Input name="q" defaultValue={filter.search} placeholder="Payee, description, IBAN, note" />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Category</span>
          <Select name="category" defaultValue={categoryParam ?? ""} className="w-56">
            <option value="">All categories</option>
            <option value="none">Uncategorised</option>
            <CategoryOptions categories={categories} />
          </Select>
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Direction</span>
          <Select name="dir" defaultValue={one(sp.dir) ?? ""} className="w-32">
            <option value="">In & out</option>
            <option value="out">Money out</option>
            <option value="in">Money in</option>
          </Select>
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">From</span>
          <Input type="date" name="from" defaultValue={filter.from} className="w-40" />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">To</span>
          <Input type="date" name="to" defaultValue={filter.to} className="w-40" />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Sort</span>
          <Select name="sort" defaultValue={filter.sort} className="w-40">
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_asc">Largest out</option>
            <option value="amount_desc">Largest in</option>
          </Select>
        </label>
        <button className={buttonClass("primary")} type="submit">
          Filter
        </button>
        <LinkButton href={`/accounts/${account.id}/transactions`} variant="ghost">
          Reset
        </LinkButton>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {total} transaction{total === 1 ? "" : "s"}
          {categoryParam === "none" && total > 0 ? " to categorise" : ""}
        </p>
        <div className="flex gap-2">
          <AddTransactionForm accountId={account.id} business={account.kind === "business"} categories={categories} />
          <a className={buttonClass("secondary", "sm")} href={`/api/accounts/${account.id}/export`}>
            <Download className="size-3.5" aria-hidden /> Export CSV
          </a>
        </div>
      </div>

      <Card>
        <TransactionTable
          rows={rows}
          categories={categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName, kind: c.kind, vatCode: c.vatCode }))}
          business={account.kind === "business"}
          accountId={account.id}
        />
      </Card>

      {pages > 1 ? (
        <nav className="flex items-center justify-center gap-2 text-sm" aria-label="Pages">
          {page > 1 ? (
            <LinkButton size="sm" href={pageHref(page - 1)}>
              Previous
            </LinkButton>
          ) : null}
          <span className="text-ink-2">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <LinkButton size="sm" href={pageHref(page + 1)}>
              Next
            </LinkButton>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
