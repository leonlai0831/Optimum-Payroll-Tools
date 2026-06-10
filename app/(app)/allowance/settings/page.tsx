import { redirect } from "next/navigation";
import { getAllowanceConfig } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import { AllowanceRatesForm } from "@/components/allowance-rates-form";

export const dynamic = "force-dynamic";

export default async function AllowanceSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const canEdit = caps.has("swim_edit_settings");
  if (!canEdit && !caps.has("swim_view_settings")) redirect("/");

  const config = await getAllowanceConfig();
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <AllowanceRatesForm initial={config} canEdit={canEdit} />
    </div>
  );
}
