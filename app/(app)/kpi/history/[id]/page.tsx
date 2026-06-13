import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { getAllowanceConfig, getLatestAssessmentFinalByCoach, getRun } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";
import { Badge } from "@/components/ui";
import { DeleteRunButton } from "@/components/delete-run-button";
import { ReopenRunButton } from "@/components/reopen-run-button";
import { RunReview } from "@/components/run-review";
import { RunCoachTable } from "@/components/run-coach-table";
import { RunDigest } from "@/components/run-digest";
import { RunAudit } from "@/components/run-audit";
import { formatDateTime, rm } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, run] = await Promise.all([getCurrentUser(), getRun(Number(id))]);
  if (!user) redirect("/login");
  if (!run) notFound();

  const isDraft = run.status === "draft";
  // Independent lookups in one round-trip: finalize rights, the operator center
  // codes + aliases (passed to the table so it can normalize the stored —
  // possibly raw — center labels onto the configured codes for display), and the
  // latest assessment finals (only consumed in the draft-review branch below).
  const [canFinalize, allowanceConfig, assessmentMap] = await Promise.all([
    userCan(user, "finalize_kpi"),
    getAllowanceConfig(),
    getLatestAssessmentFinalByCoach(),
  ]);
  const coaches = [...run.coachResults].sort((a, b) => b.finalScore - a.finalScore);
  const totalPayout = coaches.reduce((s, c) => s + (c.payout || 0), 0);

  const header = (
    <div className="flex items-start justify-between">
      <div>
        <Link href="/kpi/history" className="flex items-center gap-1 text-xs text-indigo-600">
          <ArrowLeft className="h-3 w-3" /> Back to history
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-lg font-bold text-gray-900">
          {run.periodLabel}
          {isDraft ? (
            <Badge className="border-amber-300 bg-amber-100 text-amber-800">
              Draft · pending review
            </Badge>
          ) : (
            <Badge className="border-green-300 bg-green-100 text-green-800">Finalized</Badge>
          )}
        </h1>
        <p className="text-xs text-gray-500">
          {run.filename} · saved {formatDateTime(run.createdAt)} · total{" "}
          {rm(totalPayout)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!isDraft && canFinalize && <ReopenRunButton id={run.id} period={run.periodLabel} />}
        {canFinalize && <DeleteRunButton id={run.id} />}
      </div>
    </div>
  );

  // Editable management review — admin / super_admin on a draft month.
  if (isDraft && canFinalize) {
    // Latest assessment final % per coach — auto-fills + locks each coach's Mgmt %.
    const assessmentByCoach: Record<number, number> = Object.fromEntries(
      [...assessmentMap.entries()].map(([coachId, pct]) => [coachId, Math.round(pct)]),
    );
    return (
      <>
        {header}
        <RunReview
          run={{
            id: run.id,
            periodLabel: run.periodLabel,
            filename: run.filename,
            csvRows: run.csvRows,
            configSnapshot: run.configSnapshot,
            coachResults: run.coachResults,
          }}
          assessmentByCoach={assessmentByCoach}
          centers={allowanceConfig.centers}
        />
      </>
    );
  }

  // Read-only snapshot (finalized, or a draft viewed without finalize rights).
  return (
    <>
      {header}

      {isDraft && !canFinalize && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This month is awaiting management review. An admin needs to enter the management
            assessment scores and finalize it before the bonus is locked.
          </span>
        </div>
      )}

      {!isDraft && (
        <div className="grid gap-3 md:grid-cols-2">
          <RunDigest
            period={run.periodLabel}
            coaches={coaches.map((c) => ({
              name: c.canonicalName,
              finalScore: c.finalScore,
              grade: c.grade,
              payout: c.payout,
            }))}
          />
          <RunAudit runId={run.id} />
        </div>
      )}

      <RunCoachTable
        coaches={coaches}
        periodLabel={run.periodLabel}
        centers={allowanceConfig.centers}
        centerAliases={allowanceConfig.centerAliases}
      />
    </>
  );
}
