import { redirect } from "next/navigation";
import { getAllowanceConfig, listCoaches } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { StaffDirectory, type EmployeeRow } from "@/components/staff-directory";

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
  const employees: EmployeeRow[] = coaches.map((c) => ({
    id: c.id,
    name: c.canonicalName,
    jobRole: c.jobRole,
    employmentType: c.employmentType,
    center: c.center,
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
