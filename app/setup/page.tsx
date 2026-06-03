import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { Card } from "@/components/ui";
import { getHealthReport, type HealthCheck } from "@/lib/health";

// Reflect live env + DB state on every request, never a build-time snapshot.
export const dynamic = "force-dynamic";

const STATUS_BANNER: Record<
  Awaited<ReturnType<typeof getHealthReport>>["status"],
  { className: string; title: string; body: string }
> = {
  ok: {
    className: "bg-success-bg text-success",
    title: "Ready to go",
    body: "All required checks pass. You can sign in.",
  },
  degraded: {
    className: "bg-warning-bg text-warning",
    title: "Usable, with warnings",
    body: "The app should run, but review the warnings below before relying on it in production.",
  },
  error: {
    className: "bg-danger-bg text-danger",
    title: "Setup incomplete",
    body: "One or more required checks fail. Fix the items marked below, then reload this page.",
  },
};

function CheckIcon({ check }: { check: HealthCheck }) {
  if (check.ok) return <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />;
  if (check.severity === "critical") return <XCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden />;
  if (check.severity === "warning") return <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />;
  return <Info className="h-5 w-5 shrink-0 text-muted" aria-hidden />;
}

export default async function SetupPage() {
  const report = await getHealthReport();
  const banner = STATUS_BANNER[report.status];

  return (
    <div className="flex min-h-screen items-start justify-center p-4 sm:items-center">
      <Card className="w-full max-w-lg overflow-hidden border-t-4 border-t-brand">
        <div className="bg-white px-6 pb-4 pt-7 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <Image
              src="/logo-full.png"
              alt="Optimum Swim School"
              width={1080}
              height={350}
              priority
              className="h-8 w-auto"
            />
            <span className="h-5 w-px bg-gray-200" aria-hidden />
            <Image
              src="/logo-fit.png"
              alt="Optimum Fit"
              width={1600}
              height={355}
              priority
              className="h-5 w-auto"
            />
          </div>
          <p className="mt-3 text-sm font-semibold text-gray-500">Deployment setup status</p>
        </div>

        <div className="px-6 pb-6">
          <div className={`rounded-lg px-4 py-3 ${banner.className}`}>
            <p className="text-sm font-bold">{banner.title}</p>
            <p className="mt-0.5 text-sm">{banner.body}</p>
          </div>

          <ul className="mt-4 space-y-3">
            {report.checks.map((check) => (
              <li key={check.name} className="flex items-start gap-3">
                <CheckIcon check={check} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{check.name}</p>
                  <p className="text-sm text-gray-600">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link href="/login" className="font-semibold text-brand hover:underline">
              ← Back to sign in
            </Link>
            <span className="text-gray-400">
              Checked {new Date(report.generatedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
