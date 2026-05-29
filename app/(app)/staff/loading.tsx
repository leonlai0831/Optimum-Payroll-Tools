import { SectionNav } from "@/components/section-nav";
import { BrandedLoader } from "@/components/branded-loader";

export default function Loading() {
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="staff" />
      <BrandedLoader />
    </div>
  );
}
