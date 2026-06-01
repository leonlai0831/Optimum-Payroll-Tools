import { getTrendData } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { sectionNavProps } from "@/lib/auth/section-nav-props";
import { TrendsView } from "@/components/trends-view";
import { RetentionView } from "@/components/retention-view";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const [data, navProps] = await Promise.all([getTrendData(), sectionNavProps()]);
  // Retention check-ins use sensitive cross-staff data — management only.
  const canSeeRetention = navProps.caps.includes("view_all_staff");
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" {...navProps} />
      <TrendsView data={data} />
      {canSeeRetention && <RetentionView />}
    </div>
  );
}
