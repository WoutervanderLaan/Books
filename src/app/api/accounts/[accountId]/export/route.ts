import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { categories, transactions } from "@/lib/db/schema";
import { getAccount } from "@/lib/services/accounts";

export const dynamic = "force-dynamic";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** All transactions of an account as CSV (semicolon separated, decimal comma: opens cleanly in Dutch Excel). */
export function GET(_req: Request, ctx: RouteContext<"/api/accounts/[accountId]/export">) {
  return ctx.params.then(({ accountId }) => {
    const db = getDb();
    const account = getAccount(db, Number(accountId));
    if (!account) return new Response("Not found", { status: 404 });
    const rows = db
      .select({ tx: transactions, category: categories.name, group: categories.groupName })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(eq(transactions.accountId, account.id))
      .orderBy(asc(transactions.date), asc(transactions.id))
      .all();
    const header = ["Date", "Amount", "Counterparty", "Counterparty IBAN", "Description", "Category", "Group", "VAT code", "VAT amount", "Invoice date", "Note"];
    const lines = rows.map(({ tx, category, group }) =>
      [
        tx.date,
        (tx.amount / 100).toFixed(2).replace(".", ","),
        tx.counterpartyName,
        tx.counterpartyIban,
        tx.description,
        category,
        group,
        tx.vatCode,
        tx.vatAmount != null ? (tx.vatAmount / 100).toFixed(2).replace(".", ",") : "",
        tx.taxDate,
        tx.note,
      ]
        .map(csvCell)
        .join(";"),
    );
    const body = "﻿" + [header.map(csvCell).join(";"), ...lines].join("\r\n");
    const name = account.name.replace(/[^\w-]+/g, "-").toLowerCase();
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}-transactions.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
