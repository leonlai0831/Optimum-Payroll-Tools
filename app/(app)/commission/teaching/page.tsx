import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getTeachingConfig } from "@/lib/db/queries";
import { TeachingCalculator } from "@/components/teaching-calculator";

export const dynamic = "force-dynamic";

export default async function CoachingIncomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const config = await getTeachingConfig();
  return <TeachingCalculator initialConfig={config} />;
}
