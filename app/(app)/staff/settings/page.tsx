import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getAllowanceConfig, getPerformanceConfig } from "@/lib/db/queries";
import { CentersCard } from "@/components/centers-card";
import { PerformanceOptionsForm } from "@/components/performance-options-form";

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const canEdit = caps.has("edit_settings");
  if (!canEdit && !caps.has("view_settings") && !caps.has("view_all_staff")) redirect("/");

  const [perfConfig, allowanceConfig] = await Promise.all([
    getPerformanceConfig(),
    getAllowanceConfig(),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <CentersCard initial={allowanceConfig.centers} canEdit={canEdit} />
      <PerformanceOptionsForm initial={perfConfig} canEdit={canEdit} />
    </div>
  );
}
