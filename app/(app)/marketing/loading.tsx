import { BrandedLoader } from "@/components/branded-loader";

// Marketing has no section layout, so this loader stands in for the whole page
// body while the server component fetches.
export default function Loading() {
  return <BrandedLoader />;
}
