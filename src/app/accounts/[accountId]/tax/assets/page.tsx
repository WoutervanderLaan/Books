import { Card, CardHeader, EmptyState, Notice, Table, td, tdNum, th, thNum } from "@/components/ui";
import { ConfirmButton } from "@/components/form-bits";
import { deleteAssetAction } from "@/app/actions/tax";
import { YearSelect } from "@/components/year-select";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { getDb, requireAccount } from "@/lib/server";
import { taxOverview } from "@/lib/services/tax";
import { yearFromParams, yearOptions } from "@/lib/tax/year";
import { AssetForm } from "./asset-form";

export const metadata = { title: "Assets" };

export default async function AssetsPage({ params, searchParams }: PageProps<"/accounts/[accountId]/tax/assets">) {
  const { accountId } = await params;
  const year = yearFromParams(await searchParams);
  const account = requireAccount(accountId);
  const o = taxOverview(getDb(), account, year);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <YearSelect years={yearOptions(o.availableYears, year)} value={year} />
        <AssetForm accountId={account.id} />
      </div>
      <Notice>
        Business assets of €{o.params.minAssetValue} or more (excl. VAT) that last more than a year — laptop, camera, furniture — are depreciated
        over their useful life instead of deducted at once. Categorise the purchase as “Asset purchases (depreciated)” so it isn&apos;t counted twice.
        Total investments between €{o.params.kia.minTotal.toLocaleString("nl-NL")} and €{o.params.kia.zeroFrom.toLocaleString("nl-NL")} in a year
        also give a small-scale investment deduction (KIA).
      </Notice>
      <Card>
        <CardHeader
          title={`Depreciation ${year}`}
          description={`Total ${formatMoney(o.pnl.depreciation)} · KIA ${formatMoney(o.kia)} on ${formatMoney(o.kiaBase)} of qualifying investments`}
        />
        {o.assets.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Asset</th>
                <th className={th}>Bought</th>
                <th className={thNum}>Cost</th>
                <th className={thNum}>Life</th>
                <th className={thNum}>Depreciation {year}</th>
                <th className={thNum}>Book value end {year}</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {o.assets.map(({ asset, depreciation, bookValue }) => (
                <tr key={asset.id}>
                  <td className={td}>
                    {asset.name}
                    {asset.disposedDate ? <span className="block text-xs text-muted">Sold/disposed {formatDate(asset.disposedDate)}</span> : null}
                    {!asset.kiaEligible ? <span className="block text-xs text-muted">No KIA</span> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap text-ink-2`}>{formatDate(asset.purchaseDate)}</td>
                  <td className={tdNum}>{formatMoney(asset.cost)}</td>
                  <td className={`${tdNum} text-ink-2`}>{asset.usefulLifeYears} yr</td>
                  <td className={tdNum}>{formatMoney(depreciation)}</td>
                  <td className={tdNum}>{formatMoney(bookValue)}</td>
                  <td className={`${td} text-right`}>
                    <div className="flex justify-end gap-1">
                      <AssetForm accountId={account.id} asset={asset} />
                      <ConfirmButton action={deleteAssetAction.bind(null, asset.id)} confirm={`Delete ${asset.name}?`} variant="ghost">
                        Delete
                      </ConfirmButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="px-5 pb-5">
            <EmptyState title="No assets yet">Add equipment you bought for the business so depreciation and KIA are included in the estimate.</EmptyState>
          </div>
        )}
      </Card>
    </div>
  );
}
