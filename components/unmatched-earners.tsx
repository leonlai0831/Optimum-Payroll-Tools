"use client";

import { AlertTriangle, CheckCircle2, UserPlus } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { rm } from "@/lib/utils";
import type { UnmatchedEarner } from "@/lib/earnings/income";

const SOURCE_LABEL: Record<UnmatchedEarner["source"], string> = {
  commission: "Commission",
  coaching: "Coaching",
  both: "Both",
};

/**
 * Coverage check: earners in saved months that match no roster member, so their
 * income never surfaces under any staff page. The per-row "Add" pre-fills the
 * roster form above (commission keys on staff code; coaching on name / aliases).
 */
export function UnmatchedEarners({
  earners,
  canEdit = false,
  onAdd,
}: {
  earners: UnmatchedEarner[];
  canEdit?: boolean;
  onAdd?: (earner: UnmatchedEarner) => void;
}) {
  const showAdd = canEdit && !!onAdd;
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
      <MobileCards>
        {earners.map((e) => (
          <div key={e.name + e.staffCode} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-gray-900">{e.name}</div>
                <div className="mt-0.5 text-[11px] text-gray-400">
                  {e.staffCode ? <span className="font-mono">{e.staffCode} · </span> : null}
                  <span title={e.periods.join(", ")}>
                    {e.months} month{e.months === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="nums text-base font-bold text-amber-700">{rm(e.total)}</div>
                <div className="text-[11px] text-gray-400">total</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <div className="text-overline text-muted">Source</div>
                <div className="mt-0.5">
                  <Badge className="border-amber-200 bg-amber-50 text-amber-700">{SOURCE_LABEL[e.source]}</Badge>
                </div>
              </div>
              <div>
                <div className="text-overline text-muted">Commission</div>
                <div className="nums mt-0.5 text-sm text-gray-700">{rm(e.totalCommission)}</div>
              </div>
              <div>
                <div className="text-overline text-muted">Coaching</div>
                <div className="nums mt-0.5 text-sm text-gray-700">{rm(e.totalCoaching)}</div>
              </div>
            </div>
            {showAdd && (
              <button
                onClick={() => onAdd!(e)}
                title={`Pre-fill the roster form to add ${e.name}`}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-brand/30 text-sm font-medium text-brand hover:bg-brand/5 active:bg-brand/10"
              >
                <UserPlus className="h-4 w-4" /> Add to roster
              </button>
            )}
          </div>
        ))}
      </MobileCards>
      <DesktopTable>
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
              {showAdd && <th className="px-3 py-2 text-right">Action</th>}
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
                {showAdd && (
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => onAdd!(e)}
                      title={`Pre-fill the roster form to add ${e.name}`}
                      className="inline-flex items-center gap-1 rounded-md border border-brand/30 px-2 py-1 text-xs font-medium text-brand hover:bg-brand/5"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Add
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </DesktopTable>
    </Card>
  );
}
