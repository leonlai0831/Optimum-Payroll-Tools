import { notFound, redirect } from "next/navigation";
import { getAllowanceConfig, getCoach } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import { CoachProfileView, type CoachProfile } from "@/components/coach-profile-view";

export const dynamic = "force-dynamic";

export default async function CoachProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coachId = Number(id);
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);

  const canViewAll = caps.has("view_all_staff");
  const isOwn = caps.has("view_own") && user.coachId === coachId;
  if (!canViewAll && !isOwn) redirect("/");

  const [coach, config] = await Promise.all([getCoach(coachId), getAllowanceConfig()]);
  if (!coach) notFound();

  const profile: CoachProfile = {
    id: coach.id,
    name: coach.canonicalName,
    jobRole: coach.jobRole,
    employmentType: coach.employmentType,
    center: coach.center,
    active: coach.active,
    allowanceTier: coach.allowanceTier,
  };

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="staff" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      <CoachProfileView
        coach={profile}
        centers={config.centers}
        canEdit={caps.has("edit_staff")}
        backHref={canViewAll ? "/staff" : undefined}
      />
    </div>
  );
}
