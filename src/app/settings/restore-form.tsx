"use client";

import { useActionState } from "react";
import { restoreBackupAction } from "@/app/actions/backup";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function RestoreForm() {
  const [state, action] = useActionState(restoreBackupAction, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Replace all current data with this backup?")) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input
        type="file"
        name="file"
        accept=".db,.sqlite,.sqlite3"
        required
        className="text-sm file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
      />
      <SubmitButton variant="danger">Restore backup</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
