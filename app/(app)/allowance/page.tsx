import { getAllowanceConfig, listCoaches } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { AllowanceCalculator } from "@/components/allowance-calculator";

export const dynamic = "force-dynamic";

export default async function AllowancePage() {
  const [config, coaches] = await Promise.all([getAllowanceConfig(), listCoaches()]);
  const roster = coaches
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      canonicalName: c.canonicalName,
      center: c.center,
      allowanceTier: c.allowanceTier,
    }));
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <AllowanceCalculator config={config} coaches={roster} />
    </div>
  );
}
