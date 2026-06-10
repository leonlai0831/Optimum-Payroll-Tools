import Link from "next/link";
import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { listRecentAssessments } from "@/lib/db/queries";
import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { GRADE_LABEL } from "@/lib/assessment/types";

export const dynamic = "force-dynamic";

export default async function RecentAssessmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const recent = await listRecentAssessments(30);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <History className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-bold text-gray-900">Recent assessments</span>
        <span className="text-xs text-gray-500">{recent.length}</span>
      </div>

      {recent.length === 0 ? (
        <EmptyState
          bare
          icon={History}
          title="No assessments yet"
          body="Submitted assessments appear here. Use “New assessment” to file the first one."
        />
      ) : (
        <>
          <MobileCards>
            {recent.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link
                    href={`/staff/${a.coachId}`}
                    className="font-semibold text-indigo-700 hover:underline"
                  >
                    {a.coachName}
                  </Link>
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    {new Date(a.observedOn).toLocaleDateString()}
                    {a.assessor && <span> · {a.assessor}</span>}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {[a.classType, a.poolType].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base font-bold tabular-nums text-gray-900">
                    {a.totalPercent.toFixed(1)}%
                  </div>
                  <div className="mt-1">
                    <Badge>{GRADE_LABEL[a.finalGrade]}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </MobileCards>
          <DesktopTable>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Instructor</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Assessor</th>
                <th className="px-4 py-2 text-left">Class</th>
                <th className="px-4 py-2 text-right">Score</th>
                <th className="px-4 py-2 text-left">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recent.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/staff/${a.coachId}`} className="text-indigo-700 hover:underline">
                      {a.coachName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {new Date(a.observedOn).toLocaleDateString()}
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
                </tr>
              ))}
            </tbody>
          </table>
          </DesktopTable>
        </>
      )}
    </Card>
  );
}
