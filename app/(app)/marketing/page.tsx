import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Marketing KPI — module scaffold.
// This route is intentionally NOT wired into the section nav yet; link it in
// (components/section-nav.tsx / the home launcher) once the module is ready.
// Build the screens in this folder, domain logic under lib/marketing, and
// components under components/marketing. See ONBOARDING.md at the repo root.
export default async function MarketingKpiPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="fade-in space-y-4">
      <h1 className="text-lg font-bold text-gray-900">Marketing KPI</h1>
      <p className="max-w-prose text-sm text-gray-500">
        Module scaffold. Build the marketing-KPI screens here in{" "}
        <code className="rounded bg-gray-100 px-1">app/(app)/marketing/</code>,
        keep domain logic under{" "}
        <code className="rounded bg-gray-100 px-1">lib/marketing/</code> and
        components under{" "}
        <code className="rounded bg-gray-100 px-1">components/marketing/</code>.
      </p>
    </div>
  );
}
