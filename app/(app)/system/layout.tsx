import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";

export const dynamic = "force-dynamic";

/**
 * System Setting shell. super_admin owns the whole section; a `manage_users`
 * holder may enter for the Users page only — Audit log and Permissions each
 * re-check super_admin themselves, and the section nav hides their tabs.
 * Renders the section nav once so it persists across sub-navigation,
 * mirroring the staff/commission section layouts.
 */
export default async function SystemLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (user.role !== "super_admin" && !caps.has("manage_users")) redirect("/");

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="system" caps={[...caps]} isSuperAdmin />
      {children}
    </div>
  );
}
