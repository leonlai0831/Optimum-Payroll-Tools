import { getTrendData } from "@/lib/db/queries";
import { TrendsView } from "@/components/trends-view";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const data = await getTrendData();
  return <TrendsView data={data} />;
}
