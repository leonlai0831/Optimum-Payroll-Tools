import { Card } from "@/components/ui";
import { rm } from "@/lib/utils";
import type { TeachingSummary } from "@/lib/teaching/types";

/**
 * Presentational per-coach income table. No hooks / client deps, so it renders
 * in both the client calculator and the server-rendered History detail.
 */
export function TeachingReport({ summary }: { summary: TeachingSummary }) {
  return (
    <Card className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left text-overline text-muted">
            <th className="px-3 py-2">Coach</th>
            <th className="px-3 py-2 text-right">PT sessions</th>
            <th className="px-3 py-2 text-right">PT attendees</th>
            <th className="px-3 py-2 text-right">PT income</th>
            <th className="px-3 py-2 text-right">Group sessions</th>
            <th className="px-3 py-2 text-right">Group income</th>
            <th className="px-3 py-2 text-right">Total income</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {summary.coaches.map((c) => (
            <tr key={c.staffName} className="tabular-nums">
              <td className="px-3 py-2 text-gray-900">{c.staffName}</td>
              <td className="px-3 py-2 text-right text-gray-600">{c.ptSessions}</td>
              <td className="px-3 py-2 text-right text-gray-600">{c.ptAttendees}</td>
              <td className="px-3 py-2 text-right text-gray-600">{rm(c.ptIncome)}</td>
              <td className="px-3 py-2 text-right text-gray-600">{c.groupSessions}</td>
              <td className="px-3 py-2 text-right text-gray-600">{rm(c.groupIncome)}</td>
              <td className="px-3 py-2 text-right font-bold text-green-700">{rm(c.totalIncome)}</td>
            </tr>
          ))}
          {summary.coaches.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                No coaching income in this file.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="border-t-2 border-gray-200 bg-gray-50 tabular-nums">
          <tr className="font-bold text-gray-900">
            <td className="px-3 py-2">TOTAL</td>
            <td className="px-3 py-2 text-right">{summary.totals.ptSessions}</td>
            <td className="px-3 py-2 text-right">{summary.totals.ptAttendees}</td>
            <td className="px-3 py-2 text-right">{rm(summary.totals.ptIncome)}</td>
            <td className="px-3 py-2 text-right">{summary.totals.groupSessions}</td>
            <td className="px-3 py-2 text-right">{rm(summary.totals.groupIncome)}</td>
            <td className="px-3 py-2 text-right text-green-700">{rm(summary.totals.totalIncome)}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
