import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCommissionTrendData } from "@/lib/db/queries";
import { CommissionTrendsView } from "@/components/commission-trends-view";

export const dynamic = "force-dynamic";

export default async function CommissionTrendsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await getCommissionTrendData();
  return <CommissionTrendsView data={data} />;
}
