import Link from "next/link";
import { History } from "lucide-react";
import { listRuns } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { Card } from "@/components/ui";
import { rm } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const runs = await listRuns();

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" />
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <History className="h-5 w-5 text-indigo-500" /> Saved Months
      </h1>

      {runs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          No saved months yet. Upload a CSV on the Dashboard and click “Save month”.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Period</th>
                <th className="px-4 py-2 text-left">File</th>
                <th className="px-4 py-2 text-center">Coaches</th>
                <th className="px-4 py-2 text-right">Total Payout</th>
                <th className="px-4 py-2 text-left">Saved</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-indigo-50/40">
                  <td className="px-4 py-2 font-semibold text-gray-900">{r.periodLabel}</td>
                  <td className="px-4 py-2 text-gray-500">{r.filename}</td>
                  <td className="px-4 py-2 text-center text-gray-600">{r.coachCount}</td>
                  <td className="px-4 py-2 text-right font-medium text-green-700">
                    {rm(r.totalPayout)}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/kpi/history/${r.id}`}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
