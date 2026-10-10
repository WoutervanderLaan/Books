import { Card, CardBody, CardHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { clearCsvMappingAction, deleteAccountAction } from "@/app/actions/accounts";
import { requireAccount } from "@/lib/server";
import { AccountSettingsForm } from "./account-settings-form";

export const metadata = { title: "Account settings" };

export default async function AccountSettingsPage({ params }: PageProps<"/accounts/[accountId]/settings">) {
  const { accountId } = await params;
  const account = requireAccount(accountId);
  return (
    <div className="max-w-3xl space-y-6">
      <AccountSettingsForm account={account} />
      {account.csvMapping ? (
        <Card>
          <CardHeader title="Saved CSV column mapping" description="Used automatically when a CSV with the same columns is imported." />
          <CardBody>
            <ConfirmButton action={clearCsvMappingAction.bind(null, account.id)} confirm="Forget the saved column mapping?" variant="secondary">
              Forget mapping
            </ConfirmButton>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Delete account" description="Removes this account with all its transactions, budget, rules, hours and assets. This cannot be undone — make a backup first." />
        <CardBody>
          <ConfirmButton action={deleteAccountAction.bind(null, account.id)} confirm={`Delete “${account.name}” and all its data?`} size="md">
            Delete account
          </ConfirmButton>
        </CardBody>
      </Card>
    </div>
  );
}
