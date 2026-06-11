import { redirect } from "next/navigation";
import { HandCoins } from "lucide-react";
import { listFreelancerRuns } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import { FreelancerHistoryView } from "@/components/freelancer-history-view";

export const dynamic = "force-dynamic";

export default async function FreelancerHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const [rows] = await Promise.all([listFreelancerRuns()]);

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="freelancer" />
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <HandCoins className="h-5 w-5 text-indigo-500" /> Saved Freelancer Payments
      </h1>
      <FreelancerHistoryView rows={rows} canEdit={caps.has("run_freelancer")} />
    </div>
  );
}
