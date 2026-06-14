import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getAllowanceConfig, getPermissionConfig, listUsers } from "@/lib/db/queries";
import { PermissionsForm } from "@/components/permissions-form";
import type { OverrideUser } from "@/components/category-overrides";
import type { CenterScopeUser } from "@/components/center-overrides";
import { effectiveCategories } from "@/lib/auth/types";
import type { Capability, ConfigurableRole, Role } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

// Roles holding any of these can review/approve/finalize, so center scope is
// meaningful for them — others would just see a no-op control.
const REVIEW_CAPS: Capability[] = ["review_timesheet", "review_lesson_plans", "finalize_kpi"];

export default async function PermissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/");
  const [config, userRows, allowance] = await Promise.all([
    getPermissionConfig(),
    listUsers(),
    getAllowanceConfig(),
  ]);

  // The "User overrides" tab: stored override (null = inherits the role default).
  const users: OverrideUser[] = userRows.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    fullName: u.fullName,
    role: u.role,
    visibleCategories: u.visibleCategories,
    active: u.active,
  }));

  // Center scope is only relevant to accounts that can review/finalize.
  const canReviewRole = (role: Role): boolean =>
    role === "super_admin" ||
    REVIEW_CAPS.some((c) => (config.capabilities[role as ConfigurableRole] ?? []).includes(c));
  // Centers are all SWIM centers (review/finalize happen in the swim brand), so
  // center scope only means anything for an account that can actually see swim.
  const centerUsers: CenterScopeUser[] = userRows
    .filter((u) => canReviewRole(u.role))
    .map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      fullName: u.fullName,
      role: u.role,
      managedCenters: u.managedCenters,
      active: u.active,
      hasSwimAccess: effectiveCategories(u.role, u.visibleCategories, config.categories).includes(
        "swim",
      ),
    }));

  return (
    <PermissionsForm
      initial={config}
      users={users}
      centerUsers={centerUsers}
      allCenters={allowance.centers}
    />
  );
}
