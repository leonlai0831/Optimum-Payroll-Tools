import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";

export const dynamic = "force-dynamic";

/**
 * Instructor Assessment section shell. Gates the whole module on
 * `edit_appraisals` (the instructor-evaluation capability, admin + supervisor by
 * default) and renders the section nav once. Swim-School brand (the form is the
 * swim instructor observation form).
 */
export default async function AssessmentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("edit_appraisals")) redirect("/");

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="assessment" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      {children}
    </div>
  );
}
