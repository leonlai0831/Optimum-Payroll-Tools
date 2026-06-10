import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canSeeCategory } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

/**
 * Staff Allowance section shell. Enforces the "swim" launcher category here,
 * not just on the launcher card, so direct navigation (bookmark / typed URL) is
 * bounced home too — mirrors the marketing/commission layouts. Capability gates
 * (`run_allowance`, settings) stay per-page; effective access = category
 * visible AND capability granted. Pages render their own SectionNav.
 */
export default async function AllowanceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeCategory(user, "swim")) redirect("/");
  return <>{children}</>;
}
