import { redirect } from "next/navigation";
import { getAllowanceConfig } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { LessonPlanForm } from "@/components/lesson-plan-form";

export const dynamic = "force-dynamic";

/** New plan: pick Actual / Replacement, then fill the matching form. */
export default async function NewLessonPlanPage() {
  // Branch options come from the operator's configured centers (Staff → Settings).
  const [config, user] = await Promise.all([getAllowanceConfig(), getCurrentUser()]);
  if (!user) redirect("/login");
  return (
    <LessonPlanForm
      centers={[...config.centers]}
      instructorName={user.displayName || user.email}
    />
  );
}
