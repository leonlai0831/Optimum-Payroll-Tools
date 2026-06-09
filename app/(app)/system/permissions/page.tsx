import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPermissionConfig } from "@/lib/db/queries";
import { PermissionsForm } from "@/components/permissions-form";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/");
  const config = await getPermissionConfig();

  return <PermissionsForm initial={config} />;
}
