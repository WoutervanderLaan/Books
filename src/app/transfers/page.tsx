import Link from "next/link";
import { acceptTransfersAction } from "@/app/actions/transfers";
import { SubmitButton } from "@/components/form-bits";
import { Amount, Card, CardHeader, EmptyState, Notice, PageHeader, Table, td, th, thNum } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { getDb } from "@/lib/server";
import { listAccounts } from "@/lib/services/accounts";
import { transferOverview } from "@/lib/services/transfers";

export const metadata = { title: "Own transfers" };

export default function TransfersPage() {
  const db = getDb();
  const { review, missing } = transferOverview(db);
  const withoutIban = listAccounts(db).filter((a) => !a.iban);

  return (
    <>
      <PageHeader
        title="Own transfers"
        description="Money moving between your own accounts is recognised by IBAN. It isn't income or spending, so it's left out of the totals and shown as savings where it goes to a savings account."
      />
      <div className="space-y-6">
        {withoutIban.length ? (
          <Notice tone="warning">
            {withoutIban.map((a, i) => (
              <span key={a.id}>
                {i ? ", " : ""}
                <Link className="font-medium text-accent hover:underline" href={`/accounts/${a.id}/settings`}>
                  {a.name}
                </Link>
              </span>
            ))}{" "}
            {withoutIban.length === 1 ? "has" : "have"} no IBAN yet, so transfers to {withoutIban.length === 1 ? "it" : "them"} can&apos;t be recognised.
          </Notice>
        ) : null}

        <Card>
          <CardHeader
            title="Categorised by you, but between your own accounts"
            description="These go to or come from one of your accounts, but you picked a different category earlier. Nothing changes until you confirm."
          />
          {review.length ? (
            <form action={acceptTransfersAction}>
              <Table>
                <thead>
                  <tr>
                    <th className={`${th} w-8`}>
                      <span className="sr-only">Select</span>
                    </th>
                    <th className={th}>Date</th>
                    <th className={th}>Account</th>
                    <th className={th}>Description</th>
                    <th className={th}>Your category</th>
                    <th className={th}>Becomes</th>
                    <th className={thNum}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {review.map((r) => (
                    <tr key={r.id}>
                      <td className={td}>
                        <input type="checkbox" name="id" value={r.id} defaultChecked aria-label={`Mark ${formatDate(r.date)} as own transfer`} className="accent-[var(--accent)]" />
                      </td>
                      <td className={`${td} whitespace-nowrap text-ink-2`}>{formatDate(r.date)}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {r.accountName} <span className="text-muted">{r.amount < 0 ? "→" : "←"}</span> {r.otherAccountName}
                      </td>
                      <td className={`${td} max-w-64`}>
                        <span className="block truncate" title={r.description}>{r.counterpartyName || r.description || "—"}</span>
                      </td>
                      <td className={`${td} text-ink-2`}>{r.currentCategory ?? "—"}</td>
                      <td className={td}>{r.suggestedCategory}</td>
                      <td className={`${td} text-right`}>
                        <Amount cents={r.amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="flex items-center gap-3 px-5 py-4">
                <SubmitButton>Mark selected as own transfers</SubmitButton>
                <span className="text-xs text-muted">Unticked rows keep your category.</span>
              </div>
            </form>
          ) : (
            <EmptyState title="Nothing to review">All transactions between your accounts are categorised as transfers.</EmptyState>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Missing on the other side"
            description="A transfer appears in one account, but no matching amount shows up within a few days in the other account, even though its statements cover that date. Often a missing import or a transfer that was reversed."
          />
          {missing.length ? (
            <Table>
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Seen in</th>
                  <th className={th}>Expected in</th>
                  <th className={th}>Description</th>
                  <th className={thNum}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {missing.map((m) => (
                  <tr key={m.leg.id}>
                    <td className={`${td} whitespace-nowrap text-ink-2`}>{formatDate(m.leg.date)}</td>
                    <td className={td}>
                      <Link className="hover:underline" href={`/accounts/${m.leg.accountId}/transactions?from=${m.leg.date}&to=${m.leg.date}`}>
                        {m.accountName}
                      </Link>
                    </td>
                    <td className={td}>
                      <Link className="hover:underline" href={`/accounts/${m.otherAccountId}/import`}>
                        {m.otherAccountName}
                      </Link>
                    </td>
                    <td className={`${td} max-w-64`}>
                      <span className="block truncate" title={m.description}>{m.counterpartyName || m.description || "—"}</span>
                    </td>
                    <td className={`${td} text-right`}>
                      <Amount cents={m.leg.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="All transfers matched">
              Every transfer has a counterpart wherever both accounts&apos; statements cover the date.
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
