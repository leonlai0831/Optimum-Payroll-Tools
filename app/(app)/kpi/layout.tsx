import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { canSeeCategory } from "@/lib/auth/types";
import { SectionNav } from "@/components/section-nav";

export const dynamic = "force-dynamic";

/**
 * Instructor KPI Bonus section shell. Gates the section on the "swim" launcher
 * category (effective access = category visible AND capability granted) and
 * renders the section nav once (caps-aware) so it persists across
 * sub-navigation instead of re-rendering per page — which made permission-gated
 * tabs (e.g. "Links", requires `swim_view_staff`) flicker out during the
 * loading frame. Mirrors the commission section layout.
 */
export default async function KpiLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeCategory(user, "swim")) redirect("/");
  const caps = await getCapabilities(user);

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      {children}
    </div>
  );
}
