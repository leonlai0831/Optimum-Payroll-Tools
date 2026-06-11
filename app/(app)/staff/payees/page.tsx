import { redirect } from "next/navigation";
import { listCoaches } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { canSeeCategory } from "@/lib/auth/types";
import { rosterCoachesFor } from "@/lib/staff/roster";
import { PayeeBulkEntry, type PayeeRow } from "@/components/payee-bulk-entry";

export const dynamic = "force-dynamic";

/** Workforce → Payees: bulk entry for freelancer bank details. */
export default async function PayeesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!canSeeCategory(user, "swim")) redirect("/");
  if (!caps.has("swim_view_staff")) redirect("/");

  const coaches = await listCoaches();
  const rows: PayeeRow[] = rosterCoachesFor("freelancer", coaches)
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName))
    .map((c) => ({
      id: c.id,
      name: c.canonicalName,
      icNo: c.icNo ?? "",
      bankName: c.bankName ?? "",
      bankAccount: c.bankAccount ?? "",
    }));

  return <PayeeBulkEntry rows={rows} canEdit={caps.has("swim_edit_staff")} />;
}
