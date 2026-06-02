import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { listCommissionRuns } from "@/lib/db/queries";
import { CommissionHistoryView } from "@/components/commission-history-view";

export const dynamic = "force-dynamic";

export default async function CommissionHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const runs = await listCommissionRuns();

  return (
    <>
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <History className="h-5 w-5 text-brand" /> Saved commission months
      </h1>
      <CommissionHistoryView runs={runs} />
    </>
  );
}
