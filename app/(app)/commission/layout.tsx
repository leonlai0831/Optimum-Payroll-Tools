import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { canSeeCategory } from "@/lib/auth/types";
import { SectionNav } from "@/components/section-nav";

export const dynamic = "force-dynamic";

/**
 * Optimum Fit — Staff Commission section shell. Gates the whole section on
 * `run_commission` AND the "fit" launcher category (Category Visibility), and
 * renders the section nav once. The black/yellow brand skin comes from the app
 * shell (BrandShell sets data-brand="fit" for /commission).
 */
export default async function CommissionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeCategory(user, "fit")) redirect("/");
  const caps = await getCapabilities(user);
  if (!caps.has("run_commission")) redirect("/");

  return (
    <div className="fade-in space-y-4">
      <SectionNav
        section="commission"
        caps={[...caps]}
        isSuperAdmin={user.role === "super_admin"}
      />
      {children}
    </div>
  );
}
