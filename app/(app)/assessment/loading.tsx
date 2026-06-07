import { BrandedLoader } from "@/components/branded-loader";

// The assessment layout renders the SectionNav above this Suspense boundary.
export default function Loading() {
  return <BrandedLoader />;
}
