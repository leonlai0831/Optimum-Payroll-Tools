import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";

export const dynamic = "force-dynamic";

/**
 * Staff section shell. Renders the section nav once (caps-aware) so it persists
 * across sub-navigation instead of re-rendering per page — which made the
 * permission-gated tabs (Directory, Users, Audit, Permissions, …) flicker out
 * during the loading frame. Per-page redirects still enforce access; the layout
 * only ensures a login + renders the nav. Mirrors the commission section layout.
 *
 * Deliberately NOT gated on the "swim" launcher category: `/staff/[id]` must
 * stay reachable for the user's OWN coach profile (the launcher's My Profile
 * card is category-independent). The directory and settings pages gate "swim"
 * individually; `/staff/[id]` gates it only when viewing someone ELSE'S profile.
 */
export default async function StaffLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="staff" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      {children}
    </div>
  );
}
