import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listCommissionRuns, listTeachingRuns } from "@/lib/db/queries";
import { HistoryTabs } from "@/components/history-tabs";

export const dynamic = "force-dynamic";

export default async function CommissionHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [commissionRuns, teachingRuns] = await Promise.all([listCommissionRuns(), listTeachingRuns()]);

  return <HistoryTabs commissionRuns={commissionRuns} teachingRuns={teachingRuns} />;
}
