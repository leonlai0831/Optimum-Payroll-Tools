import { getTrendData } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { TrendsView } from "@/components/trends-view";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const data = await getTrendData();
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" />
      <TrendsView data={data} />
    </div>
  );
}
