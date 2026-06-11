import { notFound, redirect } from "next/navigation";
import {
  getAllowanceConfig,
  getCoachProfile,
  listAssessmentsForCoach,
  listNotesForCoach,
} from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { canSeeCategory } from "@/lib/auth/types";
import {
  CoachProfileView,
  type AllowancePoint,
  type AssessmentView,
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

  const canViewAll = caps.has("swim_view_staff");
  const isOwn = caps.has("view_own") && user.coachId === coachId;
  if (!canViewAll && !isOwn) redirect("/");
  // The launcher's My Profile card is category-independent: a user's OWN coach
  // profile stays reachable even without the "swim" category. Anyone else's
  // profile is a swim brand surface and needs the category too.
  if (!isOwn && !canSeeCategory(user, "swim")) redirect("/");

  const [profile, config, noteRecords, assessmentRecords] = await Promise.all([
    getCoachProfile(coachId),
    getAllowanceConfig(),
    listNotesForCoach(coachId),
    listAssessmentsForCoach(coachId),
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
    icNo: coach.icNo ?? "",
    bankName: coach.bankName ?? "",
    bankAccount: coach.bankAccount ?? "",
  };
  const assessmentViews: AssessmentView[] = assessmentRecords.map((a) => ({
    id: a.id,
    observedOn: a.observedOn.toISOString(),
    assessor: a.assessor,
    classType: a.classType,
    poolType: a.poolType,
    totalPercent: a.totalPercent,
    finalGrade: a.finalGrade,
    lessonPlanId: a.lessonPlanId,
  }));
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
      canEdit={caps.has("swim_edit_staff")}
      backHref={canViewAll ? "/staff" : undefined}
      kpi={kpi}
      allowance={allowancePoints}
      notes={noteViews}
      canEditNotes={caps.has("edit_notes")}
      assessments={assessmentViews}
    />
  );
}
