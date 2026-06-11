import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getKpiIngest } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { KpiIngestEditor } from "@/components/kpi-ingest-editor";

export const dynamic = "force-dynamic";

/**
 * One monthly student-data delivery: review + edit its rows. Pending deliveries
 * can also be loaded into the KPI calculator or discarded; imported and
 * discarded ones stay editable as the month's database record (edits never
 * touch a saved run — it snapshotted the rows at import time); a superseded
 * delivery renders read-only. The rows stay viewable forever.
 */
export default async function ProgressDeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("run_kpi")) redirect("/");

  const { id } = await params;
  const ingest = await getKpiIngest(Number(id));
  if (!ingest) notFound();

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="progress" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      <Link
        href="/progress"
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        <ArrowLeft className="h-4 w-4" /> All months
      </Link>
      <KpiIngestEditor
        ingest={{
          id: ingest.id,
          periodLabel: ingest.periodLabel,
          label: ingest.label,
          status: ingest.status,
          source: ingest.source,
          rows: ingest.rows,
          importedRunId: ingest.importedRunId,
          importedAt: ingest.importedAt ? ingest.importedAt.toISOString() : null,
          receivedAt: ingest.receivedAt.toISOString(),
        }}
      />
    </div>
  );
}
