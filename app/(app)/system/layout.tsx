import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";

export const dynamic = "force-dynamic";

/**
 * System Setting shell — super_admin only. Renders the section nav once so it
 * persists across sub-navigation (Users / Audit log / Permissions), mirroring
 * the staff/commission section layouts. Each page also re-checks super_admin.
 */
export default async function SystemLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/");
  const caps = await getCapabilities(user);

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="system" caps={[...caps]} isSuperAdmin />
      {children}
    </div>
  );
}
