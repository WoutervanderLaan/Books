import { Notice } from "@/components/ui";
import { requireAccount } from "@/lib/server";
import { TaxNav } from "./tax-nav";

export default async function TaxLayout({ children, params }: LayoutProps<"/accounts/[accountId]/tax">) {
  const { accountId } = await params;
  const account = requireAccount(accountId);
  if (account.kind !== "business") {
    return <Notice>Tax tools are available for business accounts. Change the account type in its settings if this is a business account.</Notice>;
  }
  return (
    <div className="space-y-6">
      <TaxNav base={`/accounts/${account.id}/tax`} />
      {children}
    </div>
  );
}
