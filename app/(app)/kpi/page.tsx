import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import {
  getKpiIngest,
  getLatestAssessmentFinalByCoach,
  listPendingKpiIngests,
} from "@/lib/db/queries";
import { Badge, Card } from "@/components/ui";
import { Dashboard, type IngestSeed } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function KpiDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const ingestParam = typeof sp.ingest === "string" ? Number(sp.ingest) : NaN;

  // ?ingest=<id>: seed the dashboard from a staged delivery instead of a file
  // upload. Only a PENDING ingest may be loaded — an imported one would create a
  // duplicate run, so anything else bounces to its read-only detail page.
  let seed: IngestSeed | null = null;
  if (Number.isInteger(ingestParam)) {
    const ingest = await getKpiIngest(ingestParam);
    if (!ingest) redirect("/progress");
    if (ingest.status !== "pending") redirect(`/progress/${ingest.id}`);
    seed = {
      ingestId: ingest.id,
      label: ingest.label || `API upload #${ingest.id}`,
      periodLabel: ingest.periodLabel,
      rows: ingest.rows,
    };
  }

  // The latest instructor-assessment final % prefills each coach's management
  // assessment (Mgmt %).
  const [finalMap, pending] = await Promise.all([
    getLatestAssessmentFinalByCoach(),
    seed ? Promise.resolve([]) : listPendingKpiIngests(),
  ]);
  const assessmentFinal: Record<string, number> = Object.fromEntries(
    [...finalMap.entries()].map(([coachId, final]) => [String(coachId), Math.round(final)]),
  );

  return (
    <>
      {pending.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <Inbox className="h-4 w-4 text-indigo-500" /> Pending uploads
              <Badge className="border-amber-300 bg-amber-100 text-amber-800">
                {pending.length}
              </Badge>
            </h2>
            <Link
              href="/progress"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              View all →
            </Link>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Monthly KPI data pushed by the external system, waiting for your review.
          </p>
          <div className="mt-3 divide-y divide-gray-100">
            {pending.map((i) => (
              <Link
                key={i.id}
                href={`/progress/${i.id}`}
                className="flex min-h-11 flex-col justify-center gap-0.5 py-2.5 hover:bg-indigo-50/40 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-gray-900">{i.periodLabel}</span>
                  <span className="ml-2 text-xs text-gray-500">{i.label || "—"}</span>
                </span>
                <span className="nums shrink-0 text-xs text-gray-500">
                  {i.rowCount} rows · received {new Date(i.receivedAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}
      <Dashboard assessmentFinal={assessmentFinal} seed={seed} />
    </>
  );
}
