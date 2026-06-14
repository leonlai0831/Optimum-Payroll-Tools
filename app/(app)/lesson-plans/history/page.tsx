import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { listLessonPlans } from "@/lib/db/queries";
import { LessonPlanHistory } from "@/components/lesson-plan-history";

export const dynamic = "force-dynamic";

/** History: reviewers see every plan; editors see only their own. */
export default async function LessonPlanHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const isReviewer = caps.has("review_lesson_plans");
  // Reviewers see every plan, narrowed to their managed centers when scoped
  // (null = all, matching /api/lesson-plans); editors always see their own.
  const rows = await listLessonPlans(
    isReviewer ? { centers: user.managedCenters ?? undefined } : { forUserId: user.id },
  );

  return (
    <LessonPlanHistory
      isReviewer={isReviewer}
      isAdmin={user.role === "admin" || user.role === "super_admin"}
      currentUserId={user.id}
      rows={rows.map((r) => ({
        id: r.id,
        createdByUserId: r.createdByUserId,
        type: r.type,
        status: r.status,
        createdByName: r.createdByName,
        instructorName: r.instructorName,
        actualInstructorName: r.actualInstructorName,
        center: r.center,
        lessonDate: r.lessonDate.toISOString(),
        timeLabel: r.timeLabel,
        levelType: r.levelType,
        classLevel: r.classLevel,
        selfEvalAt: r.selfEvalAt ? r.selfEvalAt.toISOString() : null,
      }))}
    />
  );
}
