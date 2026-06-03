import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getCommissionConfig } from "@/lib/db/queries";
import { CommissionSettingsForm } from "@/components/commission-settings-form";

export const dynamic = "force-dynamic";

export default async function CommissionSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const canEdit = caps.has("edit_settings");
  if (!canEdit && !caps.has("view_settings")) redirect("/");

  const config = await getCommissionConfig();
  return <CommissionSettingsForm initial={config} canEdit={canEdit} />;
}
