import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getCoach, listAssessmentsForCoach } from "@/lib/db/queries";
import { Badge, Card } from "@/components/ui";
import { AssessmentForm } from "@/components/assessment-form";
import { DeleteAssessmentButton } from "@/components/delete-assessment-button";
import { GRADE_LABEL } from "@/lib/assessment/types";

export const dynamic = "force-dynamic";

export default async function AssessInstructorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const coach = await getCoach(Number(id));
  if (!coach || coach.jobRole !== "instructor") notFound();
  const past = await listAssessmentsForCoach(coach.id);

  return (
    <div className="space-y-4">
      <Link
        href="/assessment"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" /> Instructors
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{coach.canonicalName}</h1>
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
          Instructor
        </span>
        {coach.center && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
            {coach.center}
          </span>
        )}
      </div>

      <AssessmentForm coachId={coach.id} assessorDefault={user.email} />

      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-900">
          Past assessments · {past.length}
        </div>
        {past.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">
            No assessments yet. Use “New assessment” above — the latest score feeds this
            instructor’s KPI management assessment.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Assessor</th>
                  <th className="px-4 py-2 text-left">Class</th>
                  <th className="px-4 py-2 text-right">Score</th>
                  <th className="px-4 py-2 text-left">Grade</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {past.map((a, i) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 text-gray-700">
                      {new Date(a.observedOn).toLocaleDateString()}
                      {i === 0 && (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-indigo-500">
                          latest → KPI
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{a.assessor || "—"}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {[a.classType, a.poolType].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-gray-900">
                      {a.totalPercent.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2">
                      <Badge>{GRADE_LABEL[a.finalGrade]}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <DeleteAssessmentButton id={a.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
