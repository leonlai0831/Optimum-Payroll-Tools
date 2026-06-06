import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { listRuns } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { KpiHistoryView } from "@/components/kpi-history-view";
import { AskData } from "@/components/ask-data";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [caps, runs] = await Promise.all([getCapabilities(user), listRuns()]);

  return (
    <>
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <History className="h-5 w-5 text-indigo-500" /> Saved Months
      </h1>
      {runs.length > 0 && <AskData />}
      <KpiHistoryView runs={runs} canExport={caps.has("view_all_staff")} />
    </>
  );
}
