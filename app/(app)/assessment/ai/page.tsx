import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listCoaches } from "@/lib/db/queries";
import { AssessmentAi } from "@/components/assessment-ai";
import type { InstructorOption } from "@/components/assessment-form";

export const dynamic = "force-dynamic";

export default async function AssessmentAiPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const coaches = await listCoaches();
  const instructors: InstructorOption[] = coaches
    .filter((c) => c.jobRole === "instructor" && c.active)
    .map((c) => ({ id: c.id, name: c.canonicalName }));

  return <AssessmentAi instructors={instructors} />;
}
