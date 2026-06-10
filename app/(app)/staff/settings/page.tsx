import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { canSeeCategory } from "@/lib/auth/types";
import { getAllowanceConfig } from "@/lib/db/queries";
import { CentersCard } from "@/components/centers-card";

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  // Swim brand surface — category gated per-page (see the staff layout note).
  if (!canSeeCategory(user, "swim")) redirect("/");
  const canEdit = caps.has("swim_edit_settings");
  if (!canEdit && !caps.has("swim_view_settings") && !caps.has("swim_view_staff")) redirect("/");

  const allowanceConfig = await getAllowanceConfig();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <CentersCard
        initial={allowanceConfig.centers}
        initialAliases={allowanceConfig.centerAliases}
        canEdit={canEdit}
      />
    </div>
  );
}
