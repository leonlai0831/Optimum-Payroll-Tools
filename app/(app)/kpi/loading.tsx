import { SectionNav } from "@/components/section-nav";
import { BrandedLoader } from "@/components/branded-loader";

// Must render instantly — a loading.tsx that awaits anything (e.g. caps via the
// DB) defeats its purpose: the click appears to hang until that resolves. So the
// nav here is rendered WITHOUT caps (a few permission-gated tabs are omitted for
// this one frame); the real page renders the full caps-aware nav once loaded.
export default function Loading() {
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" />
      <BrandedLoader />
    </div>
  );
}
