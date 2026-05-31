import { SectionNav } from "@/components/section-nav";
import { sectionNavProps } from "@/lib/auth/section-nav-props";
import { BrandedLoader } from "@/components/branded-loader";

export default async function Loading() {
  // Resolve caps so permission-gated tabs (e.g. KPI "Links") stay visible during
  // loading — without them the nav would briefly drop those tabs and flicker.
  const navProps = await sectionNavProps();
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" {...navProps} />
      <BrandedLoader />
    </div>
  );
}
