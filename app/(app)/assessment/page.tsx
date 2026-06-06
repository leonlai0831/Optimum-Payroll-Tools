import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getLatestAssessmentFinalByCoach, listCoaches } from "@/lib/db/queries";
import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { gradeFor } from "@/lib/assessment/calc";
import { GRADE_LABEL } from "@/lib/assessment/types";

export const dynamic = "force-dynamic";

export default async function AssessmentListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [coaches, latest] = await Promise.all([listCoaches(), getLatestAssessmentFinalByCoach()]);
  // For now the form is instructor-specific; front-desk assessment is future work.
  const instructors = coaches.filter((c) => c.jobRole === "instructor" && c.active);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <Users className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-bold text-gray-900">Instructors</span>
        <span className="text-xs text-gray-500">{instructors.length}</span>
      </div>

      {instructors.length === 0 ? (
        <EmptyState
          bare
          icon={ClipboardCheck}
          title="No instructors yet"
          body="Add instructors under Staff — only the instructor role is assessed here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Instructor</th>
                <th className="px-4 py-2 text-left">Center</th>
                <th className="px-4 py-2 text-right">Latest score</th>
                <th className="px-4 py-2 text-left">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {instructors.map((c) => {
                const pct = latest.get(c.id) ?? null;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/assessment/${c.id}`} className="text-indigo-700 hover:underline">
                        {c.canonicalName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{c.center || "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">
                      {pct != null ? `${pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {pct != null ? (
                        <Badge>{GRADE_LABEL[gradeFor(pct)]}</Badge>
                      ) : (
                        <span className="text-xs text-gray-400">not assessed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
