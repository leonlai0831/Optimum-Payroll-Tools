import { SectionNav } from "@/components/section-nav";
import { SectionSkeleton } from "@/components/section-skeleton";

export default function Loading() {
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" />
      <SectionSkeleton />
    </div>
  );
}
