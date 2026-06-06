import { BrandedLoader } from "@/components/branded-loader";

// The staff layout renders the SectionNav above this Suspense boundary, so the
// loader only replaces the page body — the nav stays put (no flicker).
export default function Loading() {
  return <BrandedLoader />;
}
