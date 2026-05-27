import { notFound, redirect } from "next/navigation";
import { getAllowanceConfig, getCoachProfile } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import {
  CoachProfileView,
  type AllowancePoint,
  type CoachProfile,
} from "@/components/coach-profile-view";

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

  const [profile, config] = await Promise.all([getCoachProfile(coachId), getAllowanceConfig()]);
  if (!profile) notFound();
  const { coach, kpi, allowance } = profile;

  const coachProfile: CoachProfile = {
    id: coach.id,
    name: coach.canonicalName,
    jobRole: coach.jobRole,
    employmentType: coach.employmentType,
    center: coach.center,
    active: coach.active,
    allowanceTier: coach.allowanceTier,
  };
  const allowancePoints: AllowancePoint[] = allowance.map((a) => ({
    id: a.id,
    period: a.periodLabel,
    tier: a.tier,
    center: a.center,
    teaching: a.teaching,
    grandTotal: a.grandTotal,
  }));

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="staff" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      <CoachProfileView
        coach={coachProfile}
        centers={config.centers}
        canEdit={caps.has("edit_staff")}
        backHref={canViewAll ? "/staff" : undefined}
        kpi={kpi}
        allowance={allowancePoints}
      />
    </div>
  );
}
