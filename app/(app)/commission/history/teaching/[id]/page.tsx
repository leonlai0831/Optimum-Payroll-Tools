import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getTeachingRun } from "@/lib/db/queries";
import { TeachingReport } from "@/components/teaching-report";
import { Button } from "@/components/ui";
import { rm } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeachingRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, run] = await Promise.all([getCurrentUser(), getTeachingRun(Number(id))]);
  if (!user) redirect("/login");
  if (!run) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link
            href="/commission/history"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> Back to history
          </Link>
          <h1 className="mt-0.5 text-lg font-bold text-gray-900">{run.periodLabel} · Coaching income</h1>
          <p className="text-xs text-gray-400">
            {run.summary.coaches.length} coaches · {rm(run.summary.totals.totalIncome)} total · PT rate{" "}
            {rm(run.configSnapshot.ptRate)}/attendee · group {rm(run.configSnapshot.groupRate)}/session
          </p>
        </div>
        <a href={`/api/teaching/runs/${run.id}/export`}>
          <Button variant="outline">
            <Download className="h-4 w-4" /> Download Excel
          </Button>
        </a>
      </div>
      <TeachingReport summary={run.summary} />
    </div>
  );
}
