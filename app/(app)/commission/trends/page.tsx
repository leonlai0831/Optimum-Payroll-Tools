import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCommissionTrendData, getTeachingTrendData } from "@/lib/db/queries";
import { TrendsTabs } from "@/components/trends-lazy";

export const dynamic = "force-dynamic";

export default async function CommissionTrendsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [commission, teaching] = await Promise.all([getCommissionTrendData(), getTeachingTrendData()]);
  return <TrendsTabs commission={commission} teaching={teaching} />;
}
