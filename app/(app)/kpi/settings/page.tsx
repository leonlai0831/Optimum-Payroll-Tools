import { redirect } from "next/navigation";
import { getConfig } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import { SettingsForm } from "@/components/settings-form";
import { TargetSuggestions } from "@/components/target-suggestions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const canEdit = caps.has("edit_settings");
  if (!canEdit && !caps.has("view_settings")) redirect("/");

  const config = await getConfig();
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      {canEdit && <TargetSuggestions />}
      <SettingsForm initial={config} canEdit={canEdit} />
    </div>
  );
}
