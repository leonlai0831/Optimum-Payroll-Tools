import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { getLatestAssessmentFinalByCoach, getRun } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";
import { Badge, Card } from "@/components/ui";
import { DeleteRunButton } from "@/components/delete-run-button";
import { RunReview } from "@/components/run-review";
import { RunDigest } from "@/components/run-digest";
import { RunAudit } from "@/components/run-audit";
import { rm } from "@/lib/utils";

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
  const canFinalize = await userCan(user, "finalize_kpi");
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
          {run.filename} · saved {new Date(run.createdAt).toLocaleString()} · total{" "}
          {rm(totalPayout)}
        </p>
      </div>
      <DeleteRunButton id={run.id} />
    </div>
  );

  // Editable management review — admin / super_admin on a draft month.
  if (isDraft && canFinalize) {
    // Latest assessment final % per coach — auto-fills + locks each coach's Mgmt %.
    const assessmentMap = await getLatestAssessmentFinalByCoach();
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

      <Card className="overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Coach</th>
              <th className="px-4 py-2 text-left">Center</th>
              <th className="px-4 py-2 text-center">Students</th>
              <th className="px-4 py-2 text-left">Position</th>
              <th className="px-4 py-2 text-center">Score</th>
              <th className="px-4 py-2 text-center">Grade</th>
              <th className="px-4 py-2 text-right">Allowance</th>
              <th className="px-4 py-2 text-right">Payout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {coaches.map((c) => (
              <tr key={c.canonicalName}>
                <td className="px-4 py-2 font-medium text-gray-900">
                  {c.canonicalName}
                  {!c.isComplete && (
                    <span className="ml-2 text-[10px] text-amber-600">incomplete</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">{c.center}</td>
                <td className="px-4 py-2 text-center text-gray-600">{c.students}</td>
                <td className="px-4 py-2 text-gray-600">{c.position}</td>
                <td className="px-4 py-2 text-center font-bold text-indigo-600">
                  {c.finalScore.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-center">
                  <Badge className="border-gray-300 bg-gray-100 text-gray-700">{c.grade}</Badge>
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {c.teachingAllowance ? rm(c.teachingAllowance) : "—"}
                </td>
                <td className="px-4 py-2 text-right font-medium text-green-700">{rm(c.payout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
