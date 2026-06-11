import { redirect } from "next/navigation";
import { Layers } from "lucide-react";
import { getAllowanceConfig, listCoaches } from "@/lib/db/queries";
import { rosterCoachesFor } from "@/lib/staff/roster";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import { AllowanceBulkEntry } from "@/components/allowance-bulk-entry";

export const dynamic = "force-dynamic";

export default async function AllowanceBulkPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("run_allowance")) redirect("/allowance");

  const [config, coaches] = await Promise.all([getAllowanceConfig(), listCoaches()]);
  // Full-time roster only — freelancers are paid via Freelancer Payment.
  const roster = rosterCoachesFor("allowance", coaches).map((c) => ({
      id: c.id,
      canonicalName: c.canonicalName,
      center: c.center,
      allowanceTier: c.allowanceTier,
    }));

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Layers className="h-5 w-5 text-indigo-500" /> Bulk entry — by center
      </h1>
      <AllowanceBulkEntry config={config} coaches={roster} />
    </div>
  );
}
