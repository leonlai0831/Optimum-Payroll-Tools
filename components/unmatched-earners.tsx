import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { rm } from "@/lib/utils";
import type { UnmatchedEarner } from "@/lib/earnings/income";

const SOURCE_LABEL: Record<UnmatchedEarner["source"], string> = {
  commission: "Commission",
  coaching: "Coaching",
  both: "Both",
};

/**
 * Coverage check: earners in saved months that match no roster member, so their
 * income never surfaces under any staff page. Add them above (commission keys on
 * staff code; coaching on name / aliases) to close the gap.
 */
export function UnmatchedEarners({ earners }: { earners: UnmatchedEarner[] }) {
  if (earners.length === 0) {
    return (
      <Card className="flex items-center gap-2 p-3 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Every earner in saved months is matched to a staff member.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <b>{earners.length}</b> earner{earners.length === 1 ? "" : "s"} in saved months match no staff member, so
          their income isn’t shown anywhere. Add them above — match <b>commission by staff code</b>, <b>coaching by
          name / aliases</b>.
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-overline text-muted">
              <th className="px-3 py-2">Name (from uploads)</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2 text-right">Months</th>
              <th className="px-3 py-2 text-right">Commission</th>
              <th className="px-3 py-2 text-right">Coaching</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {earners.map((e) => (
              <tr key={e.name + e.staffCode} className="tabular-nums">
                <td className="px-3 py-2 font-medium text-gray-900">{e.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">{e.staffCode || "—"}</td>
                <td className="px-3 py-2">
                  <Badge className="border-amber-200 bg-amber-50 text-amber-700">{SOURCE_LABEL[e.source]}</Badge>
                </td>
                <td className="px-3 py-2 text-right text-gray-600" title={e.periods.join(", ")}>
                  {e.months}
                </td>
                <td className="px-3 py-2 text-right text-gray-600">{rm(e.totalCommission)}</td>
                <td className="px-3 py-2 text-right text-gray-600">{rm(e.totalCoaching)}</td>
                <td className="px-3 py-2 text-right font-bold text-amber-700">{rm(e.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
