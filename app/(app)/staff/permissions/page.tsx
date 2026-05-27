import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getPermissionConfig } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { PermissionsForm } from "@/components/permissions-form";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/");
  const caps = await getCapabilities(user);
  const config = await getPermissionConfig();

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="staff" caps={[...caps]} isSuperAdmin />
      <PermissionsForm initial={config} />
    </div>
  );
}
