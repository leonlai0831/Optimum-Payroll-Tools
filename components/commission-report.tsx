import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { cn, rm, rm2 } from "@/lib/utils";
import type { CommissionSummary } from "@/lib/commission/types";

type Tone = "brand" | "green" | "warn" | "muted";

const toneClass: Record<Tone, string> = {
  brand: "text-brand",
  green: "text-green-700",
  warn: "text-amber-600",
  muted: "text-gray-900",
};

function Stat({ label, value, sub, tone = "muted" }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <Card className="p-3">
      <div className="text-overline text-muted">{label}</div>
      <div className={cn("mt-0.5 text-xl font-extrabold tabular-nums", toneClass[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </Card>
  );
}

/**
 * Presentational commission report (Tab 2). No hooks / no client deps, so it
 * renders in both the client calculator and the server-rendered History detail.
 */
export function CommissionReport({
  monthLabel,
  summary,
  counts,
}: {
  monthLabel: string;
  summary: CommissionSummary;
  counts?: { membership: number; subscription: number; package: number; total: number };
}) {
  const pct = `${(summary.rate * 100).toFixed(0)}%`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Qualifying registrations"
          value={String(summary.registrations.qualifying)}
          sub={`${summary.registrations.total} total − ${summary.registrations.excluded.length} reg-only`}
        />
        <Stat
          label="Commission rate"
          value={pct}
          sub={summary.belowMin ? "below minimum band" : monthLabel}
          tone={summary.belowMin ? "warn" : "brand"}
        />
        <Stat label="Total commission" value={rm(summary.totals.commission)} sub={`${summary.staff.length} staff`} tone="green" />
        <Stat
          label="Unattributed (no code)"
          value={rm2(summary.unattributedBase)}
          sub="not commissionable"
          tone={summary.unattributedBase > 0 ? "warn" : "muted"}
        />
      </div>

      {summary.belowMin && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Qualifying registrations ({summary.registrations.qualifying}) are below the lowest rate band — the
            applied rate is <b>0%</b>. Review the uploads or the bands in Settings.
          </span>
        </div>
      )}

      {summary.registrations.excluded.length > 0 && (
        <details className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-gray-700">
            {summary.registrations.excluded.length} registration-only member
            {summary.registrations.excluded.length === 1 ? "" : "s"} excluded from the rate count
          </summary>
          <p className="mt-2 text-gray-600">{summary.registrations.excluded.join(", ")}</p>
        </details>
      )}

      <Card className="overflow-hidden">
        <MobileCards>
          {summary.staff.map((s) => (
            <div key={s.staffCode} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{s.staffName || "—"}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-gray-400">
                    {s.staffCode} · {s.transactions} txn{s.transactions === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="nums text-base font-bold text-green-700">{rm(s.commission)}</div>
                  <div className="text-[11px] text-gray-400">commission</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-overline text-muted">Subscription</div>
                  <div className="nums mt-0.5 text-sm text-gray-700">{rm2(s.subscriptionBase)}</div>
                </div>
                <div>
                  <div className="text-overline text-muted">Package</div>
                  <div className="nums mt-0.5 text-sm text-gray-700">{rm2(s.packageBase)}</div>
                </div>
                <div>
                  <div className="text-overline text-muted">Registration</div>
                  <div className="nums mt-0.5 text-sm text-gray-700">{rm2(s.registrationBase)}</div>
                </div>
                <div>
                  <div className="text-overline text-muted">Total base</div>
                  <div className="nums mt-0.5 text-sm font-medium text-gray-900">{rm2(s.totalBase)}</div>
                </div>
              </div>
            </div>
          ))}
          {summary.staff.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No commissionable sales (no rows carry a staff_code).
            </div>
          )}
          {/* Totals card: mirrors the desktop tfoot. */}
          <div className="bg-gray-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-gray-900">TOTAL</div>
                <div className="mt-0.5 text-[11px] text-gray-400">
                  {summary.totals.transactions} txn{summary.totals.transactions === 1 ? "" : "s"}
                </div>
              </div>
              <div className="nums shrink-0 text-base font-bold text-green-700">
                {rm(summary.totals.commission)}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <div className="text-overline text-muted">Subscription</div>
                <div className="nums mt-0.5 text-sm text-gray-700">{rm2(summary.totals.subscriptionBase)}</div>
              </div>
              <div>
                <div className="text-overline text-muted">Package</div>
                <div className="nums mt-0.5 text-sm text-gray-700">{rm2(summary.totals.packageBase)}</div>
              </div>
              <div>
                <div className="text-overline text-muted">Registration</div>
                <div className="nums mt-0.5 text-sm text-gray-700">{rm2(summary.totals.registrationBase)}</div>
              </div>
              <div>
                <div className="text-overline text-muted">Total base</div>
                <div className="nums mt-0.5 text-sm font-medium text-gray-900">{rm2(summary.totals.totalBase)}</div>
              </div>
            </div>
            <div className="mt-3 space-y-1 border-t border-gray-200 pt-2 text-xs text-gray-500">
              <div className="flex items-baseline justify-between gap-2">
                <span>All sales pre-SST (incl. unattributed)</span>
                <span className="nums">{rm2(summary.allSalesPreSst)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span>Unattributed (no staff_code) — not commissionable</span>
                <span className="nums">{rm2(summary.unattributedBase)}</span>
              </div>
            </div>
          </div>
        </MobileCards>

        <DesktopTable>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-overline text-muted">
              <th className="px-3 py-2">Staff code</th>
              <th className="px-3 py-2">Staff name</th>
              <th className="px-3 py-2 text-right"># Txns</th>
              <th className="px-3 py-2 text-right">Subscription</th>
              <th className="px-3 py-2 text-right">Package</th>
              <th className="px-3 py-2 text-right">Registration</th>
              <th className="px-3 py-2 text-right">Total base</th>
              <th className="px-3 py-2 text-right">Commission</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.staff.map((s) => (
              <tr key={s.staffCode} className="tabular-nums">
                <td className="px-3 py-2 font-mono text-xs text-gray-700">{s.staffCode}</td>
                <td className="px-3 py-2 text-gray-900">{s.staffName || "—"}</td>
                <td className="px-3 py-2 text-right text-gray-600">{s.transactions}</td>
                <td className="px-3 py-2 text-right text-gray-600">{rm2(s.subscriptionBase)}</td>
                <td className="px-3 py-2 text-right text-gray-600">{rm2(s.packageBase)}</td>
                <td className="px-3 py-2 text-right text-gray-600">{rm2(s.registrationBase)}</td>
                <td className="px-3 py-2 text-right font-medium text-gray-900">{rm2(s.totalBase)}</td>
                <td className="px-3 py-2 text-right font-bold text-green-700">{rm(s.commission)}</td>
              </tr>
            ))}
            {summary.staff.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                  No commissionable sales (no rows carry a staff_code).
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-gray-200 bg-gray-50 tabular-nums">
            <tr className="font-bold text-gray-900">
              <td className="px-3 py-2" colSpan={2}>
                TOTAL
              </td>
              <td className="px-3 py-2 text-right">{summary.totals.transactions}</td>
              <td className="px-3 py-2 text-right">{rm2(summary.totals.subscriptionBase)}</td>
              <td className="px-3 py-2 text-right">{rm2(summary.totals.packageBase)}</td>
              <td className="px-3 py-2 text-right">{rm2(summary.totals.registrationBase)}</td>
              <td className="px-3 py-2 text-right">{rm2(summary.totals.totalBase)}</td>
              <td className="px-3 py-2 text-right text-green-700">{rm(summary.totals.commission)}</td>
            </tr>
            <tr className="text-xs text-gray-500">
              <td className="px-3 py-1.5" colSpan={6}>
                All sales pre-SST (incl. unattributed)
              </td>
              <td className="px-3 py-1.5 text-right">{rm2(summary.allSalesPreSst)}</td>
              <td />
            </tr>
            <tr className="text-xs text-gray-500">
              <td className="px-3 py-1.5" colSpan={6}>
                Unattributed (no staff_code) — not commissionable
              </td>
              <td className="px-3 py-1.5 text-right">{rm2(summary.unattributedBase)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        </DesktopTable>
      </Card>

      {counts && (
        <p className="text-xs text-gray-400">
          Consolidated {counts.total} rows — {counts.membership} membership, {counts.subscription} subscription,{" "}
          {counts.package} package.
        </p>
      )}
    </div>
  );
}
