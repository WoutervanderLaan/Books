import { Card, CardHeader, Table, td, tdNum, th, thNum } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { undoImportAction } from "@/app/actions/import";
import { formatDate } from "@/lib/dates";
import { SUPPORTED_FORMATS } from "@/lib/import";
import { getDb, requireAccount } from "@/lib/server";
import { listImports } from "@/lib/services/imports";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import" };

const BANK_TIPS: [bank: string, tip: string][] = [
  ["ING", "Mijn ING → your account → ‘Af- en bijschrijvingen downloaden’ → CSV (puntkomma) or CAMT.053."],
  ["Rabobank", "Rekeningen → ‘Transacties downloaden’ → CSV or CAMT.053."],
  ["ABN AMRO", "Rekeningen → ‘Mutaties downloaden’ → TXT (tab-separated), CAMT.053 or MT940."],
  ["bunq", "App → account → ‘Export statement’ → CSV."],
  ["Knab / ASN / SNS / RegioBank", "Online banking → ‘Transacties downloaden/exporteren’ → CSV."],
];

export default async function ImportPage({ params }: PageProps<"/accounts/[accountId]/import">) {
  const { accountId } = await params;
  const account = requireAccount(accountId);
  const history = listImports(getDb(), account.id);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <ImportWizard accountId={account.id} hasSavedMapping={!!account.csvMapping} />
        <Card>
          <CardHeader title="Import history" description="Undo an import to remove exactly the transactions it added." />
          {history.length ? (
            <Table>
              <thead>
                <tr>
                  <th className={th}>File</th>
                  <th className={th}>Period</th>
                  <th className={thNum}>Added</th>
                  <th className={thNum}>Skipped</th>
                  <th className={th}>Imported</th>
                  <th className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((imp) => (
                  <tr key={imp.id}>
                    <td className={td}>
                      <p className="max-w-56 truncate">{imp.filename}</p>
                      <p className="text-xs text-muted">{imp.format}</p>
                    </td>
                    <td className={`${td} whitespace-nowrap text-ink-2`}>
                      {imp.dateFrom ? `${formatDate(imp.dateFrom)} – ${formatDate(imp.dateTo ?? imp.dateFrom)}` : "—"}
                    </td>
                    <td className={tdNum}>{imp.insertedRows}</td>
                    <td className={`${tdNum} text-ink-2`}>{imp.duplicateRows}</td>
                    <td className={`${td} whitespace-nowrap text-ink-2`}>{formatDate(imp.importedAt.slice(0, 10))}</td>
                    <td className={`${td} text-right`}>
                      <ConfirmButton action={undoImportAction.bind(null, imp.id)} confirm={`Remove the ${imp.insertedRows} transactions added by this import?`}>
                        Undo
                      </ConfirmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-5 pb-5 text-sm text-muted">Nothing imported yet.</p>
          )}
        </Card>
      </div>
      <aside className="space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Supported files</h2>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            {SUPPORTED_FORMATS.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Where to download</h2>
          <dl className="mt-2 space-y-2 text-sm">
            {BANK_TIPS.map(([bank, tip]) => (
              <div key={bank}>
                <dt className="font-medium text-ink">{bank}</dt>
                <dd className="text-ink-2">{tip}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">
            Overlapping periods are fine: transactions already imported are skipped. Stick to one file format per account for the most reliable duplicate detection.
          </p>
        </Card>
      </aside>
    </div>
  );
}
