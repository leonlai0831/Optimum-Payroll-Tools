import { getAllowanceConfig } from "@/lib/db/queries";
import { LessonPlanForm } from "@/components/lesson-plan-form";

export const dynamic = "force-dynamic";

/** New plan: pick Actual / Replacement, then fill the matching form. */
export default async function NewLessonPlanPage() {
  // Branch options come from the operator's configured centers (Staff → Settings).
  const config = await getAllowanceConfig();
  return <LessonPlanForm centers={[...config.centers]} />;
}
