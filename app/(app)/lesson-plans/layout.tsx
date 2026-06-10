import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";

export const dynamic = "force-dynamic";

/**
 * Lesson Plan section shell. Editors (`edit_lesson_plans`) create + manage
 * their own plans; reviewers (`review_lesson_plans`) see and review everyone's.
 * Either capability opens the section. Swim-School brand (the default skin).
 */
export default async function LessonPlansLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("edit_lesson_plans") && !caps.has("review_lesson_plans")) redirect("/");

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="lesson" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      {children}
    </div>
  );
}
