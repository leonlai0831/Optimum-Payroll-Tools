import { redirect } from "next/navigation";
import { getAllowanceConfig, listCoaches } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { StaffDirectory, type EmployeeRow } from "@/components/staff-directory";
import { makeCenterNormalizer } from "@/lib/allowance/centers";
import { splitCenters } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StaffDirectoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);

  // Staff without all-staff access only ever see their own profile.
  if (!caps.has("view_all_staff")) {
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
      canEdit={caps.has("edit_staff")}
    />
  );
}
