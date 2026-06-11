import { redirect } from "next/navigation";
import { getFreelancerConfig } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import { FreelancerSettingsForm } from "@/components/freelancer-settings-form";

export const dynamic = "force-dynamic";

export default async function FreelancerSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const canEdit = caps.has("swim_edit_settings");
  if (!canEdit && !caps.has("swim_view_settings")) redirect("/");

  const config = await getFreelancerConfig();
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="freelancer" />
      <FreelancerSettingsForm initial={config} canEdit={canEdit} />
    </div>
  );
}
