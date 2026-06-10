import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canSeeCategory } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

/**
 * Optimum Marketing section shell. Category Visibility is enforced here, not
 * just on the launcher card: an account whose "marketing" category was revoked
 * is bounced home even when navigating directly (bookmark / typed URL).
 */
export default async function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeCategory(user, "marketing")) redirect("/");
  return <>{children}</>;
}
