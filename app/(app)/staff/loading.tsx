import { SectionNav } from "@/components/section-nav";
import { sectionNavProps } from "@/lib/auth/section-nav-props";
import { BrandedLoader } from "@/components/branded-loader";

export default async function Loading() {
  // Resolve caps so permission-gated tabs stay visible during loading instead of
  // briefly dropping (and flickering) until the page itself renders.
  const navProps = await sectionNavProps();
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="staff" {...navProps} />
      <BrandedLoader />
    </div>
  );
}
