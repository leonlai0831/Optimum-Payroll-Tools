import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getKpiIngest } from "@/lib/db/queries";
import { KpiIngestEditor } from "@/components/kpi-ingest-editor";

export const dynamic = "force-dynamic";

/**
 * One staged API delivery: review + edit its rows before loading them into the
 * calculator. Imported/discarded/superseded deliveries render the same view
 * read-only — the rows stay viewable forever.
 */
export default async function KpiIngestDetailPage({
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
    <>
      <Link
        href="/kpi/ingests"
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        <ArrowLeft className="h-4 w-4" /> All API uploads
      </Link>
      <KpiIngestEditor
        ingest={{
          id: ingest.id,
          periodLabel: ingest.periodLabel,
          label: ingest.label,
          status: ingest.status,
          rows: ingest.rows,
          importedRunId: ingest.importedRunId,
          importedAt: ingest.importedAt ? ingest.importedAt.toISOString() : null,
          receivedAt: ingest.receivedAt.toISOString(),
        }}
      />
    </>
  );
}
