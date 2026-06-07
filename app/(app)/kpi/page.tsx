import { getLatestAssessmentFinalByCoach } from "@/lib/db/queries";
import { Dashboard } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function KpiDashboardPage() {
  // The latest instructor-assessment final % prefills each coach's management
  // assessment (Mgmt %).
  const finalMap = await getLatestAssessmentFinalByCoach();
  const assessmentFinal: Record<string, number> = Object.fromEntries(
    [...finalMap.entries()].map(([coachId, final]) => [String(coachId), Math.round(final)]),
  );
  return <Dashboard assessmentFinal={assessmentFinal} />;
}
