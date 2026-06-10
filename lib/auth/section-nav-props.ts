import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import type { Capability } from "@/lib/auth/types";

/**
 * Props the section nav needs to decide which permission-gated tabs to show
 * (e.g. the KPI "Links" tab requires `swim_view_staff`). Pages that don't
 * already load the user can spread this into <SectionNav {...props} />.
 *
 * Defaults to no caps / not-super-admin when signed out, so the nav simply
 * hides gated tabs rather than throwing.
 */
export async function sectionNavProps(): Promise<{
  caps: Capability[];
  isSuperAdmin: boolean;
}> {
  const user = await getCurrentUser();
  if (!user) return { caps: [], isSuperAdmin: false };
  const caps = await getCapabilities(user);
  return { caps: [...caps], isSuperAdmin: user.role === "super_admin" };
}
