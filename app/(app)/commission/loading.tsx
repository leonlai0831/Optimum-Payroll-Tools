import { BrandedLoader } from "@/components/branded-loader";

// Optimum Fit (commission) page-loading fallback. The commission layout renders
// the SectionNav above this Suspense boundary, so we only need the loader here —
// using the Fit motion logo instead of the Swim default. It inherits the
// black/yellow skin from BrandShell's data-brand="fit".
export default function Loading() {
  return <BrandedLoader src="/logo-fit-animation.mp4" />;
}
