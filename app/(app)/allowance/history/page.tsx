import { redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { listAllowanceRuns } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import { AllowanceHistoryView } from "@/components/allowance-history-view";

export const dynamic = "force-dynamic";

export default async function AllowanceHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [rows, caps] = await Promise.all([listAllowanceRuns(), getCapabilities(user)]);

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Coins className="h-5 w-5 text-indigo-500" /> Saved Allowances
      </h1>
      <AllowanceHistoryView rows={rows} canEdit={caps.has("run_allowance")} />
    </div>
  );
}
