import { SectionNav } from "@/components/section-nav";
import { BrandedLoader } from "@/components/branded-loader";

// Must render instantly — see kpi/loading.tsx. Nav is rendered without caps for
// this one frame; the loaded page renders the full caps-aware nav.
export default function Loading() {
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <BrandedLoader />
    </div>
  );
}
