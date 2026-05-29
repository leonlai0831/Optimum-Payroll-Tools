import { getConfig } from "@/lib/db/queries";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const config = await getConfig();
  return <SettingsForm initial={config} />;
}
