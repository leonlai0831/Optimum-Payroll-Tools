import { getAllowanceConfig, listCoaches } from "@/lib/db/queries";
import { AllowanceTabs } from "@/components/allowance-tabs";
import { AllowanceCalculator } from "@/components/allowance-calculator";

export const dynamic = "force-dynamic";

export default async function AllowancePage() {
  const [config, coaches] = await Promise.all([getAllowanceConfig(), listCoaches()]);
  const roster = coaches.map((c) => ({
    id: c.id,
    canonicalName: c.canonicalName,
    center: c.center,
    allowanceTier: c.allowanceTier,
  }));
  return (
    <div className="fade-in space-y-4">
      <AllowanceTabs />
      <AllowanceCalculator config={config} coaches={roster} />
    </div>
  );
}
