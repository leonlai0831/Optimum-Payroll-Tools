import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listCoaches } from "@/lib/db/queries";
import { AssessmentForm, type InstructorOption } from "@/components/assessment-form";

export const dynamic = "force-dynamic";

export default async function AssessmentFormPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const coaches = await listCoaches();
  // Instructor-only for now; front-desk assessment is future work.
  const instructors: InstructorOption[] = coaches
    .filter((c) => c.jobRole === "instructor" && c.active)
    .map((c) => ({ id: c.id, name: c.canonicalName }));

  return <AssessmentForm instructors={instructors} assessorDefault={user.email} />;
}
