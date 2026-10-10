import { PageHeader } from "@/components/ui";
import { NewAccountForm } from "./new-account-form";

export const metadata = { title: "Add account" };

export default function NewAccountPage() {
  return (
    <>
      <PageHeader title="Add account" description="Create one account per bank account you want to track." />
      <NewAccountForm />
    </>
  );
}
