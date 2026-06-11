import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getFreelancerRun } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import { DeleteFreelancerRunButton } from "@/components/freelancer-history-view";
import { Card } from "@/components/ui";
import { bankCode } from "@/lib/freelancer/banks";
import { formatDateTime, rm2 } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FreelancerRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [run, user] = await Promise.all([getFreelancerRun(Number(id)), getCurrentUser()]);
  if (!run) notFound();
  const caps = user ? await getCapabilities(user) : undefined;
  const canEdit = !!caps?.has("run_freelancer");

  const { input, result } = run;

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="freelancer" />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href="/freelancer/history"
            className="flex items-center gap-1 text-xs text-indigo-600"
          >
            <ArrowLeft className="h-3 w-3" /> Back to payments
          </Link>
          <h1 className="mt-1 text-lg font-bold text-gray-900">{run.canonicalName}</h1>
          <p className="text-xs text-gray-500">
            {run.periodLabel} · {input.position} · saved {formatDateTime(run.createdAt)}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Link
              href={`/freelancer?edit=${run.id}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
            <DeleteFreelancerRunButton id={run.id} name={run.canonicalName} />
          </div>
        )}
      </div>

      <Card className="p-5">
        {/* Payee */}
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">IC No</p>
            <p className="font-semibold text-gray-900">{input.icNo || "—"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Bank</p>
            <p className="font-semibold text-gray-900">
              {input.bankName || "—"}
              {input.bankName && bankCode(input.bankName) ? ` (${bankCode(input.bankName)})` : ""}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Account</p>
            <p className="font-semibold text-gray-900">{input.bankAccount || "—"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Service hours</p>
            <p className="font-semibold text-gray-900">{result.totalServiceHours} h</p>
          </div>
        </div>

        {/* Bonus factors */}
        <table className="mt-5 w-full text-sm">
          <tbody>
            <tr className="border-t border-gray-200">
              <td className="py-2 font-semibold text-gray-700">Student result</td>
              <td className="py-2 text-right text-gray-500">
                {input.blackCount} black / {input.colourCount} colour
              </td>
              <td className="py-2 text-right font-medium text-gray-900">
                {(result.result * 100).toFixed(1)}%
              </td>
            </tr>
            <tr className="border-t border-gray-100">
              <td className="py-2 font-semibold text-gray-700">Commitment bonus</td>
              <td className="py-2 text-right text-gray-500">all hours</td>
              <td className="py-2 text-right font-medium text-gray-900">
                +{(result.commitment * 100).toFixed(0)}%
              </td>
            </tr>
            <tr className="border-t border-gray-100">
              <td className="py-2 font-semibold text-gray-700">Attendance bonus</td>
              <td className="py-2 text-right text-gray-500">fixed hours only</td>
              <td className="py-2 text-right font-medium text-gray-900">
                +{(result.attendance * 100).toFixed(0)}%
              </td>
            </tr>
          </tbody>
        </table>

        {/* Per-center payments */}
        {input.centerRows.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-400">
              <tr className="border-t border-gray-200">
                <th className="py-1 text-left">Center</th>
                <th className="py-1 text-center">Replaced h</th>
                <th className="py-1 text-center">Fixed h</th>
                <th className="py-1 text-center">Absent</th>
                <th className="py-1 text-right">Rate</th>
                <th className="py-1 text-right">Payment</th>
              </tr>
            </thead>
            <tbody>
              {input.centerRows.map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 text-gray-700">{row.center || "—"}</td>
                  <td className="py-1 text-center text-gray-600">{row.replacedHours}</td>
                  <td className="py-1 text-center text-gray-600">{row.fixedHours}</td>
                  <td className="py-1 text-center text-gray-600">{row.absent ? "Yes" : "—"}</td>
                  <td className="py-1 text-right text-gray-600">
                    {result.centerPayments[i]?.rate ?? "—"}
                  </td>
                  <td className="py-1 text-right text-gray-900">
                    {rm2(result.centerPayments[i]?.payment ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Extras */}
        {input.extras.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-400">
              <tr className="border-t border-gray-200">
                <th className="py-1 text-left">Extra — entity</th>
                <th className="py-1 text-left">Reason</th>
                <th className="py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {input.extras.map((item, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 text-gray-700">{item.entity || "—"}</td>
                  <td className="py-1 text-gray-600">{item.reason || "—"}</td>
                  <td className="py-1 text-right text-gray-900">{rm2(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Entity totals */}
        <table className="mt-3 w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-gray-400">
            <tr className="border-t border-gray-200">
              <th className="py-1 text-left">Paid by</th>
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {result.entityTotals.map((e) => (
              <tr key={e.entity} className="border-t border-gray-100">
                <td className="py-1 text-gray-700">{e.label}</td>
                <td className="py-1 text-right text-gray-900">
                  {e.amount > 0 ? rm2(e.amount) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-5 flex items-center justify-between border-t-2 border-gray-300 pt-3">
          <span className="text-sm font-bold uppercase tracking-wide text-gray-700">
            Grand total
          </span>
          <span className="text-2xl font-extrabold text-brand">{rm2(result.grandTotal)}</span>
        </div>
      </Card>
    </div>
  );
}
