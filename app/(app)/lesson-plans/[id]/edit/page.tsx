import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";
import { getAllowanceConfig, getLessonPlan } from "@/lib/db/queries";
import { LessonPlanForm } from "@/components/lesson-plan-form";

export const dynamic = "force-dynamic";

/** Edit a plan (creator only). Saving any edit returns the plan to draft. */
export default async function EditLessonPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, plan, config] = await Promise.all([
    getCurrentUser(),
    getLessonPlan(Number(id)),
    getAllowanceConfig(),
  ]);
  if (!user) redirect("/login");
  if (!plan) notFound();
  // Only the creator (holding the edit capability) may edit.
  if (plan.createdByUserId !== user.id || !(await userCan(user, "edit_lesson_plans"))) {
    redirect(`/lesson-plans/${plan.id}`);
  }

  return (
    <LessonPlanForm
      centers={[...config.centers]}
      instructorName={user.displayName || user.email}
      initial={{
        id: plan.id,
        type: plan.type,
        instructorName: plan.instructorName,
        actualInstructorName: plan.actualInstructorName,
        center: plan.center,
        lessonDate: plan.lessonDate.toISOString().slice(0, 10),
        timeLabel: plan.timeLabel,
        levelType: plan.levelType,
        classLevel: plan.classLevel,
        ageGroup: plan.ageGroup,
        data: plan.data,
      }}
    />
  );
}
