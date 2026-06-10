import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { getAllowanceConfig, getKpiRunSavers, listRuns } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { KpiHistoryView } from "@/components/kpi-history-view";
import { AskData } from "@/components/ask-data";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // "Saved by" attribution is shown to admins + super admins only (matches allowance).
  const canSeeSavers = user.role === "admin" || user.role === "super_admin";
  const [caps, runs, savers, allowanceConfig] = await Promise.all([
    getCapabilities(user),
    listRuns(),
    canSeeSavers ? getKpiRunSavers() : Promise.resolve(null),
    getAllowanceConfig(),
  ]);

  return (
    <>
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <History className="h-5 w-5 text-indigo-500" /> Saved Bonus
      </h1>
      {runs.length > 0 && <AskData />}
      <KpiHistoryView
        runs={runs}
        canExport={caps.has("swim_view_staff")}
        canFinalize={caps.has("finalize_kpi")}
        savers={savers}
        centers={allowanceConfig.centers}
        centerAliases={allowanceConfig.centerAliases}
      />
    </>
  );
}
