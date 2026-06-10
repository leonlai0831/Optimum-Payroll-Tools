import { Card } from "@/components/ui";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { rm } from "@/lib/utils";
import type { TeachingSummary } from "@/lib/teaching/types";

/**
 * Presentational per-coach income table. No hooks / client deps, so it renders
 * in both the client calculator and the server-rendered History detail.
 * Cards on phones, the full table at `lg`+.
 */
export function TeachingReport({ summary }: { summary: TeachingSummary }) {
  return (
    <Card className="overflow-hidden">
      <MobileCards>
        {summary.coaches.map((c) => (
          <div key={c.staffName} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 truncate font-semibold text-gray-900">{c.staffName}</div>
              <div className="shrink-0 text-right">
                <div className="nums text-base font-bold text-green-700">{rm(c.totalIncome)}</div>
                <div className="text-[11px] text-gray-400">total income</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <div className="text-overline text-muted">PT income</div>
                <div className="nums mt-0.5 text-sm text-gray-700">{rm(c.ptIncome)}</div>
                <div className="nums text-[11px] text-gray-400">
                  {c.ptSessions} sessions · {c.ptAttendees} attendees
                </div>
              </div>
              <div>
                <div className="text-overline text-muted">Group income</div>
                <div className="nums mt-0.5 text-sm text-gray-700">{rm(c.groupIncome)}</div>
                <div className="nums text-[11px] text-gray-400">{c.groupSessions} sessions</div>
              </div>
            </div>
          </div>
        ))}
        {summary.coaches.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            No coaching income in this file.
          </div>
        )}
        {/* Totals card: mirrors the desktop tfoot. */}
        <div className="bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="font-bold text-gray-900">TOTAL</div>
            <div className="nums shrink-0 text-base font-bold text-green-700">
              {rm(summary.totals.totalIncome)}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <div className="text-overline text-muted">PT income</div>
              <div className="nums mt-0.5 text-sm text-gray-700">{rm(summary.totals.ptIncome)}</div>
              <div className="nums text-[11px] text-gray-400">
                {summary.totals.ptSessions} sessions · {summary.totals.ptAttendees} attendees
              </div>
            </div>
            <div>
              <div className="text-overline text-muted">Group income</div>
              <div className="nums mt-0.5 text-sm text-gray-700">{rm(summary.totals.groupIncome)}</div>
              <div className="nums text-[11px] text-gray-400">{summary.totals.groupSessions} sessions</div>
            </div>
          </div>
        </div>
      </MobileCards>

      <DesktopTable>
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
      </DesktopTable>
    </Card>
  );
}
