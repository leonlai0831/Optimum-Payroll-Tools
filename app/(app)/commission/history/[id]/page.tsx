import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getCommissionRun } from "@/lib/db/queries";
import { CommissionReport } from "@/components/commission-report";
import { ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CommissionRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, run] = await Promise.all([getCurrentUser(), getCommissionRun(Number(id))]);
  if (!user) redirect("/login");
  if (!run) notFound();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link
            href="/commission/history"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> Back to history
          </Link>
          <h1 className="mt-0.5 text-lg font-bold text-gray-900">{run.periodLabel}</h1>
        </div>
        <ButtonLink variant="outline" href={`/api/commission/runs/${run.id}/export`}>
          <Download className="h-4 w-4" /> Download Excel
        </ButtonLink>
      </div>
      <CommissionReport monthLabel={run.periodLabel} summary={run.summary} />
    </>
  );
}
