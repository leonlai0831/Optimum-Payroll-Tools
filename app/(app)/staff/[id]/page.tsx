import { notFound, redirect } from "next/navigation";
import {
  getAllowanceConfig,
  getCoachProfile,
  listNotesForCoach,
} from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import {
  CoachProfileView,
  type AllowancePoint,
  type CoachProfile,
} from "@/components/coach-profile-view";
import type { NoteView } from "@/components/notes-timeline";

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

  const [profile, config, noteRecords] = await Promise.all([
    getCoachProfile(coachId),
    getAllowanceConfig(),
    listNotesForCoach(coachId),
  ]);
  if (!profile) notFound();
  const { coach, kpi, allowance } = profile;
  const noteViews: NoteView[] = noteRecords.map((n) => ({
    id: n.id,
    noteDate: n.noteDate.toISOString(),
    type: n.type,
    title: n.title,
    body: n.body,
    severity: n.severity,
    followUp: n.followUp,
    authoredBy: n.authoredBy,
  }));

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
    <CoachProfileView
      coach={coachProfile}
      centers={config.centers}
      canEdit={caps.has("edit_staff")}
      backHref={canViewAll ? "/staff" : undefined}
      kpi={kpi}
      allowance={allowancePoints}
      notes={noteViews}
      canEditNotes={caps.has("edit_notes")}
    />
  );
}
