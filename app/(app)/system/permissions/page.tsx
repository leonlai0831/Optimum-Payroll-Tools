import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPermissionConfig, listUsers } from "@/lib/db/queries";
import { PermissionsForm } from "@/components/permissions-form";
import type { OverrideUser } from "@/components/category-overrides";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/");
  const [config, userRows] = await Promise.all([getPermissionConfig(), listUsers()]);

  // The "User overrides" tab: stored override (null = inherits the role default).
  const users: OverrideUser[] = userRows.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    visibleCategories: u.visibleCategories,
    active: u.active,
  }));

  return <PermissionsForm initial={config} users={users} />;
}
