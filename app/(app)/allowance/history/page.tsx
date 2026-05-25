import Link from "next/link";
import { Coins } from "lucide-react";
import { listAllowanceRuns, type AllowanceRunSummary } from "@/lib/db/queries";
import { AllowanceTabs } from "@/components/allowance-tabs";
import { AllowanceExportButton } from "@/components/allowance-export-button";
import { Card } from "@/components/ui";
import { rm } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AllowanceHistoryPage() {
  const rows = await listAllowanceRuns();
  const periods = [...new Set(rows.map((r) => r.periodLabel))];
  const byPeriod = new Map<string, AllowanceRunSummary[]>();
  for (const r of rows) {
    const list = byPeriod.get(r.periodLabel) ?? [];
    list.push(r);
    byPeriod.set(r.periodLabel, list);
  }

  return (
    <div className="fade-in space-y-4">
      <AllowanceTabs />
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Coins className="h-5 w-5 text-indigo-500" /> Saved Allowances
      </h1>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          No allowances saved yet. Compute one on the Calculator tab and click “Save”.
        </Card>
      ) : (
        periods.map((p) => {
          const list = byPeriod.get(p) ?? [];
          const total = list.reduce((s, r) => s + r.grandTotal, 0);
          return (
            <Card key={p} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
                <div>
                  <span className="font-semibold text-gray-900">{p}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {list.length} coach(es) · total {rm(total)}
                  </span>
                </div>
                <AllowanceExportButton period={p} rows={list} />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Coach</th>
                      <th className="px-4 py-2 text-left">Tier</th>
                      <th className="px-4 py-2 text-left">Center</th>
                      <th className="px-4 py-2 text-right">Attendance</th>
                      <th className="px-4 py-2 text-right">Teaching</th>
                      <th className="px-4 py-2 text-right">Other</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {list.map((r) => (
                      <tr key={r.id} className="hover:bg-indigo-50/40">
                        <td className="px-4 py-2 font-medium text-gray-900">{r.canonicalName}</td>
                        <td className="px-4 py-2 text-gray-600">{r.tier}</td>
                        <td className="px-4 py-2 text-gray-500">{r.center}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{rm(r.attendance)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{rm(r.teaching)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{rm(r.other)}</td>
                        <td className="px-4 py-2 text-right font-medium text-green-700">
                          {rm(r.grandTotal)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            href={`/allowance/history/${r.id}`}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
