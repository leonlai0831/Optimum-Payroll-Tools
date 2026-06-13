import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { canSeeCategory } from "@/lib/auth/types";
import { attentionBadges } from "@/lib/nav/badges";
import { SectionNav } from "@/components/section-nav";

export const dynamic = "force-dynamic";

/**
 * Clock-in section shell. Gated on the "swim" launcher category, then any of the
 * three timesheet capabilities (submit own entries / review / manage freelancer
 * schedules). Swim-School brand (the default skin).
 */
export default async function TimesheetsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeCategory(user, "swim")) redirect("/");
  const caps = await getCapabilities(user);
  if (
    !caps.has("submit_timesheet") &&
    !caps.has("review_timesheet") &&
    !caps.has("manage_freelancer_schedule")
  ) {
    redirect("/");
  }
  const badges = await attentionBadges(user, caps);

  return (
    <div className="fade-in space-y-4">
      <SectionNav
        section="timesheet"
        caps={[...caps]}
        isSuperAdmin={user.role === "super_admin"}
        badges={badges}
      />
      {children}
    </div>
  );
}
