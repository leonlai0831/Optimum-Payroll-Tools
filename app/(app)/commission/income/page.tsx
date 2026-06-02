import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listCommissionRuns } from "@/lib/db/queries";
import { IncomeReportBuilder } from "@/components/income-report-builder";

export const dynamic = "force-dynamic";

export default async function IncomeReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const runs = await listCommissionRuns();
  return <IncomeReportBuilder runs={runs.map((r) => ({ id: r.id, periodLabel: r.periodLabel }))} />;
}
