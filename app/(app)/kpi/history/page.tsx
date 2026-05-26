import { History } from "lucide-react";
import { listRuns } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { KpiHistoryView } from "@/components/kpi-history-view";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const runs = await listRuns();

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" />
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <History className="h-5 w-5 text-indigo-500" /> Saved Months
      </h1>
      <KpiHistoryView runs={runs} />
    </div>
  );
}
