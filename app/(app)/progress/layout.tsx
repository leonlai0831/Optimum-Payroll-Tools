import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canSeeCategory } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

/**
 * Student Progress section shell (the monthly student-data deliveries that feed
 * the KPI calculator). Enforces the "swim" launcher category here, not just on
 * the launcher card, so direct navigation (bookmark / typed URL) is bounced
 * home too — mirrors the allowance layout. The `run_kpi` capability gate stays
 * per-page; effective access = category visible AND capability granted. Pages
 * render their own SectionNav.
 */
export default async function ProgressLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeCategory(user, "swim")) redirect("/");
  return <>{children}</>;
}
