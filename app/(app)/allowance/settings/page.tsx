import { getAllowanceConfig } from "@/lib/db/queries";
import { AllowanceTabs } from "@/components/allowance-tabs";
import { AllowanceRatesForm } from "@/components/allowance-rates-form";

export const dynamic = "force-dynamic";

export default async function AllowanceSettingsPage() {
  const config = await getAllowanceConfig();
  return (
    <div className="fade-in space-y-4">
      <AllowanceTabs />
      <AllowanceRatesForm initial={config} />
    </div>
  );
}
