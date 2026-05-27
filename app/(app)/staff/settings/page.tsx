import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getPerformanceConfig } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { PerformanceOptionsForm } from "@/components/performance-options-form";

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const canEdit = caps.has("edit_settings");
  if (!canEdit && !caps.has("view_settings") && !caps.has("view_all_staff")) redirect("/");

  const config = await getPerformanceConfig();
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="staff" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      <PerformanceOptionsForm initial={config} canEdit={canEdit} />
    </div>
  );
}
