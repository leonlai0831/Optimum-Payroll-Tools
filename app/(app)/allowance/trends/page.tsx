import { getAllowanceTrendData } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { AllowanceTrendsView } from "@/components/allowance-trends-view";

export const dynamic = "force-dynamic";

export default async function AllowanceTrendsPage() {
  const data = await getAllowanceTrendData();
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <AllowanceTrendsView data={data} />
    </div>
  );
}
