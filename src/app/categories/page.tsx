import { Badge, Card, PageHeader, Table, td, th } from "@/components/ui";
import { getDb } from "@/lib/server";
import { allCategories } from "@/lib/services/accounts";
import { TAX_GROUP_LABELS, VAT_CODE_LABELS } from "@/lib/types";
import { ArchiveToggle, CategoryForm } from "./category-form";

export const metadata = { title: "Categories" };

const ROLE_LABELS: Record<string, string> = {
  internal_transfer: "Own transfer",
  savings: "Savings",
  private: "Private ↔ business",
  vat: "VAT payment",
  income_tax: "Income tax",
  asset: "Depreciated asset",
};

export default function CategoriesPage() {
  const categories = allCategories(getDb());
  const scopes = [
    { scope: "personal", title: "Personal" },
    { scope: "business", title: "Business" },
    { scope: "both", title: "Shared" },
  ] as const;

  return (
    <>
      <PageHeader
        title="Categories"
        description="Shared by all accounts of the same type. Transfers are left out of income and spending. Business categories also carry a default VAT rate and the profit & loss section they belong to."
        actions={<CategoryForm />}
      />
      <div className="space-y-6">
        {scopes.map(({ scope, title }) => {
          const list = categories.filter((c) => c.scope === scope);
          if (!list.length) return null;
          const business = scope === "business";
          return (
            <Card key={scope}>
              <h2 className="px-5 pt-4 pb-2 text-[15px] font-semibold text-ink">{title}</h2>
              <Table>
                <thead>
                  <tr>
                    <th className={th}>Name</th>
                    <th className={th}>Group</th>
                    <th className={th}>Type</th>
                    {business ? <th className={th}>VAT</th> : null}
                    {business ? <th className={th}>Profit & loss</th> : null}
                    <th className={th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id} className={c.archived ? "opacity-50" : undefined}>
                      <td className={td}>
                        {c.name}
                        {c.role ? (
                          <Badge className="ml-2" tone="accent">
                            {ROLE_LABELS[c.role]}
                          </Badge>
                        ) : null}
                        {c.archived ? <Badge className="ml-2">Archived</Badge> : null}
                      </td>
                      <td className={`${td} text-ink-2`}>{c.groupName}</td>
                      <td className={`${td} text-ink-2`}>{c.kind === "income" ? "Income" : c.kind === "expense" ? "Spending" : "Transfer"}</td>
                      {business ? <td className={`${td} text-ink-2`}>{c.vatCode ? VAT_CODE_LABELS[c.vatCode] : "—"}</td> : null}
                      {business ? (
                        <td className={`${td} text-ink-2`}>
                          {c.taxGroup ? TAX_GROUP_LABELS[c.taxGroup] : c.role === "asset" ? "Depreciation" : "—"}
                          {c.deductiblePct !== 100 ? ` · ${c.deductiblePct}% deductible` : ""}
                        </td>
                      ) : null}
                      <td className={`${td} text-right`}>
                        <div className="flex justify-end gap-1">
                          <CategoryForm category={c} />
                          <ArchiveToggle id={c.id} archived={c.archived} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          );
        })}
      </div>
    </>
  );
}
