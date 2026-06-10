import { BrandedLoader } from "@/components/branded-loader";

// The lesson-plans layout renders the SectionNav above this Suspense boundary.
export default function Loading() {
  return <BrandedLoader />;
}
