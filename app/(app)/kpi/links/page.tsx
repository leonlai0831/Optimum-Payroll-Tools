import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { listAllCsvAccountNames, listCoaches } from "@/lib/db/queries";
import { KpiLinkManager, type LinkCoach } from "@/components/kpi-link-manager";

export const dynamic = "force-dynamic";

export default async function KpiLinksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const canEdit = caps.has("edit_staff");
  if (!canEdit && !caps.has("view_all_staff")) redirect("/");

  const [coaches, accountNames] = await Promise.all([listCoaches(), listAllCsvAccountNames()]);
  const linkCoaches: LinkCoach[] = coaches.map((c) => ({
    id: c.id,
    canonicalName: c.canonicalName,
    aliases: c.aliases ?? [],
    center: c.center,
    tier: c.allowanceTier ?? null,
    active: c.active,
    kpiLinkNa: c.kpiLinkNa,
    kpiLinkNaTier: c.kpiLinkNaTier ?? null,
  }));

  return <KpiLinkManager coaches={linkCoaches} canEdit={canEdit} accountNames={accountNames} />;
}
