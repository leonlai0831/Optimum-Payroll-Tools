import { getLatestAppraisalOverallByCoach } from "@/lib/db/queries";
import { Dashboard } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function KpiDashboardPage() {
  const overallMap = await getLatestAppraisalOverallByCoach();
  const appraisalOverall: Record<string, number> = Object.fromEntries(
    [...overallMap.entries()].map(([coachId, overall]) => [String(coachId), overall]),
  );
  return <Dashboard appraisalOverall={appraisalOverall} />;
}
