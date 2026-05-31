import { getLatestAppraisalOverallByCoach } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { sectionNavProps } from "@/lib/auth/section-nav-props";
import { Dashboard } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function KpiDashboardPage() {
  const overallMap = await getLatestAppraisalOverallByCoach();
  const appraisalOverall: Record<string, number> = Object.fromEntries(
    [...overallMap.entries()].map(([coachId, overall]) => [String(coachId), overall]),
  );
  const navProps = await sectionNavProps();

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" {...navProps} />
      <Dashboard appraisalOverall={appraisalOverall} />
    </div>
  );
}
