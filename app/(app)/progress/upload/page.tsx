import { redirect } from "next/navigation";
import { Upload } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import { ProgressUploadForm } from "@/components/progress-upload-form";

export const dynamic = "force-dynamic";

/**
 * Manual upload: stage a month's student data from a CSV by hand — the second
 * door into the same staging pipeline as the machine push (one behavior, two
 * doors; see lib/ingest/stage.ts).
 */
export default async function ProgressUploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("run_kpi")) redirect("/");

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="progress" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Upload className="h-5 w-5 text-indigo-500" /> Upload student data
      </h1>
      <p className="text-sm text-gray-500">
        Upload a monthly CSV by hand — same flexible headers as the KPI calculator upload. The
        delivery is staged for review like an API push; a new upload for a month supersedes any
        still-pending earlier delivery.
      </p>
      <ProgressUploadForm />
    </div>
  );
}
