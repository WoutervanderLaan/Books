import { Download, HardDrive, ShieldCheck } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { getDbPath } from "@/lib/db";
import { RestoreForm } from "./restore-form";

export const metadata = { title: "Data & backup" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Data & backup" description="Everything is stored in one SQLite file on this computer." />
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader title="Where your data lives" />
          <CardBody className="space-y-3 text-sm text-ink-2">
            <p className="flex items-center gap-2">
              <HardDrive className="size-4 shrink-0 text-muted" aria-hidden />
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs break-all text-ink">{getDbPath()}</code>
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span>
                The app only listens on this computer (127.0.0.1) and makes no outside connections. Keep the file on an encrypted disk (FileVault,
                BitLocker) and include it in your regular backups. Set <code className="font-mono text-xs">FINANCE_DATA_DIR</code> to store it elsewhere.
              </span>
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Backup" description="Download a complete copy of the database. Restore it here or open it with any SQLite tool." />
          <CardBody>
            <a href="/api/backup" className={buttonClass("primary")}>
              <Download className="size-4" aria-hidden /> Download backup
            </a>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Restore" description="Replaces all current data with a backup file. The current database is kept next to it as a safety copy." />
          <CardBody>
            <RestoreForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
