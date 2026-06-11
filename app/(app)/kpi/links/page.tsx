import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { listAllCsvAccountNames, listCoaches } from "@/lib/db/queries";
import { rosterCoachesFor } from "@/lib/staff/roster";
import { KpiLinkManager, type LinkCoach } from "@/components/kpi-link-manager";

export const dynamic = "force-dynamic";

export default async function KpiLinksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const canEdit = caps.has("swim_edit_staff");
  if (!canEdit && !caps.has("swim_view_staff")) redirect("/");

  const [coaches, accountNames] = await Promise.all([listCoaches(), listAllCsvAccountNames()]);
  // Inactive staff must not appear in pay-operation lists — links are standing
  // rules for FUTURE uploads, so only active coaches belong here.
  // Full-time roster only — freelancers never appear in KPI uploads.
  const linkCoaches: LinkCoach[] = rosterCoachesFor("kpi", coaches).map((c) => ({
      id: c.id,
      canonicalName: c.canonicalName,
      aliases: c.aliases ?? [],
      center: c.center,
      tier: c.allowanceTier ?? null,
      kpiLinkNa: c.kpiLinkNa,
      kpiLinkNaTier: c.kpiLinkNaTier ?? null,
    }));

  return <KpiLinkManager coaches={linkCoaches} canEdit={canEdit} accountNames={accountNames} />;
}
