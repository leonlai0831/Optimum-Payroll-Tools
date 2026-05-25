import { getConfig } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const config = await getConfig();
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" />
      <SettingsForm initial={config} />
    </div>
  );
}
