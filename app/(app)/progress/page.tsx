import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Inbox } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { listKpiIngests, type KpiIngestSummary } from "@/lib/db/queries";
import { logger } from "@/lib/log";
import { Card } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { SectionNav } from "@/components/section-nav";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { IngestSourceBadge, IngestStatusBadge } from "@/components/ingest-badges";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Detail-link label per status: only pending needs a review, superseded is read-only. */
function actionLabel(status: KpiIngestSummary["status"]): string {
  if (status === "pending") return "Review";
  if (status === "superseded") return "View rows";
  return "View / edit";
}

/**
 * Every monthly student-data delivery ever received — API-pushed and manually
 * uploaded, staged, imported, discarded and superseded alike — grouped by
 * month, newest month first. Nothing is ever hard-deleted, so this page is the
 * permanent record of each month's database.
 */
export default async function ProgressMonthsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("run_kpi")) redirect("/");

  let ingests;
  try {
    ingests = await listKpiIngests();
  } catch (e) {
    // Surface the real cause in the function logs while keeping the error
    // boundary behavior (this list intermittently 500ed with an opaque digest).
    logger.error("progress: listKpiIngests failed", { error: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) });
    throw e;
  }

  // Group by month. listKpiIngests orders by receivedAt desc, so each month's
  // deliveries are already newest-first; months sort by periodLabel desc
  // ("YYYY-MM" sorts lexicographically).
  const byMonth = new Map<string, KpiIngestSummary[]>();
  for (const i of ingests) {
    const list = byMonth.get(i.periodLabel);
    if (list) list.push(i);
    else byMonth.set(i.periodLabel, [i]);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a));

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="progress" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <CalendarDays className="h-5 w-5 text-indigo-500" /> Monthly student data
      </h1>
      <p className="text-sm text-gray-500">
        Each month&apos;s student database, delivered by the external system or uploaded by hand.
        Review and edit a delivery, then either <strong>compute a draft KPI run</strong> from it in
        one click (auto-merge + score, then review the management scores) or load it into the
        calculator by hand — every delivery stays viewable here forever.
      </p>

      {months.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No deliveries yet"
          body="When the external system pushes monthly student data to /api/ingest/kpi — or you upload a CSV on the Upload tab — each delivery appears here for review."
        />
      ) : (
        months.map(([periodLabel, list]) => (
          <section key={periodLabel}>
            <h2 className="mb-2 flex items-baseline gap-2 px-1 text-base font-bold text-gray-900">
              {periodLabel}
              <span className="nums text-xs font-medium text-gray-400">
                {list.length} {list.length === 1 ? "delivery" : "deliveries"}
              </span>
            </h2>
            <Card className="overflow-hidden">
              {/* Mobile (< lg): one card per delivery. */}
              <MobileCards>
                {list.map((i) => (
                  <div key={i.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-words font-semibold text-gray-900">
                          {i.label || `Delivery #${i.id}`}
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-400">
                          received {formatDate(i.receivedAt)}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <IngestStatusBadge status={i.status} />
                        <IngestSourceBadge source={i.source} />
                      </div>
                    </div>
                    <div className="nums mt-2 text-xs text-gray-500">{i.rowCount} rows</div>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href={`/progress/${i.id}`}
                        className="flex min-h-11 flex-1 items-center justify-center rounded-md border border-gray-200 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100"
                      >
                        {actionLabel(i.status)}
                      </Link>
                      {i.status === "imported" && i.importedRunId != null && (
                        <Link
                          href={`/kpi/history/${i.importedRunId}`}
                          className="flex min-h-11 flex-1 items-center justify-center rounded-md border border-gray-200 py-2 text-sm font-medium text-green-700 hover:bg-green-50 active:bg-green-100"
                        >
                          Saved run →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </MobileCards>

              {/* Desktop (lg+): the full table. */}
              <DesktopTable>
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Label</th>
                      <th className="px-4 py-2 text-left">Source</th>
                      <th className="px-4 py-2 text-center">Rows</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Received</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {list.map((i) => (
                      <tr key={i.id} className="hover:bg-indigo-50/40">
                        <td className="px-4 py-2 font-semibold text-gray-900">
                          {i.label || `Delivery #${i.id}`}
                        </td>
                        <td className="px-4 py-2">
                          <IngestSourceBadge source={i.source} />
                        </td>
                        <td className="nums px-4 py-2 text-center text-gray-600">{i.rowCount}</td>
                        <td className="px-4 py-2">
                          <IngestStatusBadge status={i.status} />
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {formatDate(i.receivedAt)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {i.status === "imported" && i.importedRunId != null && (
                              <Link
                                href={`/kpi/history/${i.importedRunId}`}
                                className="text-xs font-medium text-green-700 hover:text-green-900"
                              >
                                Saved run
                              </Link>
                            )}
                            <Link
                              href={`/progress/${i.id}`}
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                            >
                              {actionLabel(i.status)}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DesktopTable>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
