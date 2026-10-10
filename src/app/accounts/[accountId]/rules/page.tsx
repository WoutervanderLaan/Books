import { and, eq, isNull, or } from "drizzle-orm";
import { Badge, Card, CardHeader, Table, td, tdNum, th, thNum } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { deleteRuleAction } from "@/app/actions/rules";
import { rules, type Rule } from "@/lib/db/schema";
import { describeRule, sortRules } from "@/lib/rules/engine";
import { getDb, requireAccount } from "@/lib/server";
import { allCategories, categoriesFor } from "@/lib/services/accounts";
import { ReapplyButtons, RuleForm, RuleToggle } from "./rule-controls";

export const metadata = { title: "Rules" };

export default async function RulesPage({ params }: PageProps<"/accounts/[accountId]/rules">) {
  const { accountId } = await params;
  const account = requireAccount(accountId);
  const db = getDb();
  const list = sortRules(
    db
      .select()
      .from(rules)
      .where(
        or(
          eq(rules.accountId, account.id),
          and(isNull(rules.accountId), or(isNull(rules.accountKind), eq(rules.accountKind, account.kind))),
        ),
      )
      .all(),
  );
  const names = new Map(allCategories(db).map((c) => [c.id, c.name]));
  const categories = categoriesFor(db, account.kind);
  const own = list.filter((r) => r.source !== "starter");
  const starter = list.filter((r) => r.source === "starter");

  const table = (items: Rule[]) => (
    <Table>
      <thead>
        <tr>
          <th className={th}>When</th>
          <th className={th}>Category</th>
          <th className={th}>Applies to</th>
          <th className={thNum}>Used</th>
          <th className={th}>On</th>
          <th className={th}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.id} className={r.enabled ? undefined : "opacity-55"}>
            <td className={td}>
              <p>{describeRule(r)}</p>
              <p className="text-xs text-muted">
                {r.source === "auto" ? "Learned from your choice" : r.source === "user" ? "Created by you" : "Starter rule"}
                {r.priority ? ` · priority ${r.priority}` : ""}
                {r.vatCode ? ` · VAT ${r.vatCode}` : ""}
              </p>
            </td>
            <td className={td}>{names.get(r.categoryId) ?? "—"}</td>
            <td className={`${td} text-ink-2`}>{r.accountId ? "This account" : `All ${r.accountKind ?? ""} accounts`}</td>
            <td className={`${tdNum} text-ink-2`}>{r.timesApplied}</td>
            <td className={td}>
              <RuleToggle id={r.id} enabled={r.enabled} />
            </td>
            <td className={`${td} text-right`}>
              <div className="flex justify-end gap-1">
                <RuleForm accountId={account.id} categories={categories} business={account.kind === "business"} rule={r} />
                <ConfirmButton action={deleteRuleAction.bind(null, r.id)} confirm="Delete this rule?" variant="ghost">
                  Delete
                </ConfirmButton>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Your rules"
          description="Rules categorise imported transactions automatically. Choosing a category with “remember” on creates one for you. Text conditions match whole words, ignoring case."
          action={
            <div className="flex flex-wrap gap-2">
              <ReapplyButtons accountId={account.id} />
              <RuleForm accountId={account.id} categories={categories} business={account.kind === "business"} />
            </div>
          }
        />
        {own.length ? table(own) : <p className="px-5 pb-5 text-sm text-muted">No rules of your own yet.</p>}
      </Card>
      <Card>
        <details>
          <summary className="cursor-pointer list-none px-5 py-4">
            <span className="text-[15px] font-semibold text-ink">Starter rules</span>{" "}
            <Badge>{starter.length}</Badge>
            <p className="mt-0.5 text-sm text-muted">Built-in rules for common Dutch shops and organisations. Your own rules always take precedence.</p>
          </summary>
          {table(starter)}
        </details>
      </Card>
    </div>
  );
}
