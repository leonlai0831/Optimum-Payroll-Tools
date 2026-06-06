import { BrandedLoader } from "@/components/branded-loader";

// The KPI layout renders the SectionNav above this Suspense boundary, so the
// loader only needs to replace the page body — the nav stays put (no flicker).
export default function Loading() {
  return <BrandedLoader />;
}
