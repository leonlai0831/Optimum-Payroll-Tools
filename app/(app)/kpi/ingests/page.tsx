import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { listKpiIngests, type KpiIngestSummary } from "@/lib/db/queries";
import { logger } from "@/lib/log";
import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { DesktopTable, MobileCards } from "@/components/responsive-table";

export const dynamic = "force-dynamic";

/** Status → badge, shared by the card and table layouts. */
function StatusBadge({ status }: { status: KpiIngestSummary["status"] }) {
  if (status === "pending") {
    return <Badge className="border-amber-300 bg-amber-100 text-amber-800">Pending</Badge>;
  }
  if (status === "imported") {
    return <Badge className="border-green-300 bg-green-100 text-green-800">Imported</Badge>;
  }
  if (status === "superseded") {
    // Muted + struck through: visually "replaced", distinct from a deliberate discard.
    return (
      <Badge className="border-gray-200 bg-gray-50 text-gray-400 line-through decoration-gray-400">
        Superseded
      </Badge>
    );
  }
  return <Badge className="border-gray-300 bg-gray-100 text-gray-600">Discarded</Badge>;
}

/**
 * Every API-pushed KPI delivery ever received — staged, imported, discarded,
 * and superseded alike. Nothing is ever hard-deleted, so this page is the
 * permanent record of what the external system sent.
 */
export default async function KpiIngestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("run_kpi")) redirect("/");

  let ingests;
  try {
    ingests = await listKpiIngests();
  } catch (e) {
    // The deployed Uploads page has been intermittently 500ing with an opaque
    // digest — surface the real cause in the function logs while keeping the
    // error boundary behavior.
    logger.error("kpi/ingests: listKpiIngests failed", { error: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) });
    throw e;
  }

  return (
    <>
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Inbox className="h-5 w-5 text-indigo-500" /> API Uploads
      </h1>
      <p className="text-sm text-gray-500">
        Monthly KPI data pushed by the external system. Review and edit a pending delivery, then
        load it into the calculator — every delivery stays viewable here forever.
      </p>

      {ingests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No API uploads yet"
          body="When the external system pushes monthly KPI data to /api/ingest/kpi, each delivery appears here for review."
        />
      ) : (
        <Card className="overflow-hidden">
          {/* Mobile (< lg): one card per delivery. */}
          <MobileCards>
            {ingests.map((i) => (
              <div key={i.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{i.periodLabel}</div>
                    <div className="mt-0.5 break-words text-[11px] text-gray-400">
                      {i.label || "—"} · received {new Date(i.receivedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={i.status} />
                  </div>
                </div>
                <div className="nums mt-2 text-xs text-gray-500">{i.rowCount} rows</div>
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    href={`/kpi/ingests/${i.id}`}
                    className="flex min-h-11 flex-1 items-center justify-center rounded-md border border-gray-200 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100"
                  >
                    {i.status === "pending" ? "Review" : "View rows"}
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
                  <th className="px-4 py-2 text-left">Period</th>
                  <th className="px-4 py-2 text-left">Label</th>
                  <th className="px-4 py-2 text-center">Rows</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Received</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ingests.map((i) => (
                  <tr key={i.id} className="hover:bg-indigo-50/40">
                    <td className="px-4 py-2 font-semibold text-gray-900">{i.periodLabel}</td>
                    <td className="px-4 py-2 text-gray-500">{i.label || "—"}</td>
                    <td className="nums px-4 py-2 text-center text-gray-600">{i.rowCount}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(i.receivedAt).toLocaleDateString()}
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
                          href={`/kpi/ingests/${i.id}`}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                        >
                          {i.status === "pending" ? "Review" : "View rows"}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTable>
        </Card>
      )}
    </>
  );
}
