import { Coins } from "lucide-react";
import { listAllowanceRuns } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { AllowanceHistoryView } from "@/components/allowance-history-view";

export const dynamic = "force-dynamic";

export default async function AllowanceHistoryPage() {
  const rows = await listAllowanceRuns();

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Coins className="h-5 w-5 text-indigo-500" /> Saved Allowances
      </h1>
      <AllowanceHistoryView rows={rows} />
    </div>
  );
}
