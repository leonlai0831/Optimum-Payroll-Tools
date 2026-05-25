import { getAllowanceConfig } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { AllowanceRatesForm } from "@/components/allowance-rates-form";

export const dynamic = "force-dynamic";

export default async function AllowanceSettingsPage() {
  const config = await getAllowanceConfig();
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <AllowanceRatesForm initial={config} />
    </div>
  );
}
