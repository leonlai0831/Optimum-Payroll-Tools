import { redirect } from "next/navigation";
import { getAllowanceConfig, listCoaches } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { canSeeCategory } from "@/lib/auth/types";
import { StaffDirectory, type EmployeeRow } from "@/components/staff-directory";
import { makeCenterNormalizer } from "@/lib/allowance/centers";
import { splitCenters } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StaffDirectoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);

  // Swim brand surface — gated per-page (not in the layout) so /staff/[id]
  // stays reachable for a user's own profile regardless of category.
  if (!canSeeCategory(user, "swim")) redirect("/");
  // Staff without all-staff access only ever see their own profile.
  if (!caps.has("swim_view_staff")) {
    redirect(user.coachId ? `/staff/${user.coachId}` : "/");
  }

  const [coaches, config] = await Promise.all([listCoaches(), getAllowanceConfig()]);
  // Map stored center values (possibly raw CSV names from before write-time
  // normalization, e.g. "Puchong Kinrara") onto the configured codes via the
  // Settings → Centers aliases, so the directory dropdowns show codes only.
  const normalizeCtr = makeCenterNormalizer(config.centers, config.centerAliases ?? {});
  const employees: EmployeeRow[] = coaches.map((c) => ({
    id: c.id,
    name: c.canonicalName,
    jobRole: c.jobRole,
    employmentType: c.employmentType,
    center: splitCenters(c.center).map(normalizeCtr).join(", "),
    allowanceTier: c.allowanceTier,
    active: c.active,
  }));

  return (
    <StaffDirectory
      employees={employees}
      centers={config.centers}
      canEdit={caps.has("swim_edit_staff")}
    />
  );
}
