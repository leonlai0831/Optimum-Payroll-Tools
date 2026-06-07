import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getAllowanceRun, getAllowanceSavers, isPeriodLocked } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import { DeleteAllowanceRunButton } from "@/components/delete-allowance-run-button";
import { ChangeRunMonthButton } from "@/components/change-run-month-button";
import { Card } from "@/components/ui";
import { rm } from "@/lib/utils";
import type { TeachingHoursRow } from "@/lib/allowance/types";

export const dynamic = "force-dynamic";

export default async function AllowanceRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [run, user] = await Promise.all([getAllowanceRun(Number(id)), getCurrentUser()]);
  if (!run) notFound();
  // Edit attribution + the month-relabel tool are for admins + super admins only.
  const canSeeEditor = user?.role === "admin" || user?.role === "super_admin";
  const canManage = canSeeEditor;
  const [locked, editedBy] = await Promise.all([
    isPeriodLocked(run.periodLabel),
    canSeeEditor ? getAllowanceSavers().then((s) => s[run.id]) : Promise.resolve(undefined),
  ]);
  // A locked month is read-only; the Edit affordance disappears.
  const canEdit = !locked && !!user && (await getCapabilities(user)).has("run_allowance");

  const { input, result } = run;
  const rates = run.configSnapshot.teaching[run.tier];
  const rowTeaching = (row: TeachingHoursRow) =>
    row.normalH * rates.normal + row.ysH * rates.youngSwimmer + row.precompH * rates.precompLifesaving;

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/allowance/history"
            className="flex items-center gap-1 text-xs text-indigo-600"
          >
            <ArrowLeft className="h-3 w-3" /> Back to allowances
          </Link>
          <h1 className="mt-1 text-lg font-bold text-gray-900">{run.canonicalName}</h1>
          <p className="text-xs text-gray-500">
            {run.periodLabel} · {run.tier} · {run.center || "—"} · saved{" "}
            {new Date(run.createdAt).toLocaleString()}
            {editedBy ? ` by ${editedBy}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link
              href={`/allowance?edit=${run.id}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          )}
          {canManage && !locked && (
            <ChangeRunMonthButton id={run.id} from={run.periodLabel} name={run.canonicalName} />
          )}
          <DeleteAllowanceRunButton id={run.id} />
        </div>
      </div>

      <Card className="p-5">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-t border-gray-200">
              <td className="py-2 font-semibold text-gray-700">Attendance</td>
              <td className="py-2 text-right text-gray-500">
                {input.opHours} op / {input.leaveHours} leave ·{" "}
                {(result.attendancePct * 100).toFixed(2)}%
              </td>
              <td className="py-2 text-right font-medium text-gray-900">{rm(result.attendance)}</td>
            </tr>
          </tbody>
        </table>

        {input.teachingRows.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-400">
              <tr className="border-t border-gray-200">
                <th className="py-1 text-left">Teaching — center</th>
                <th className="py-1 text-center">LTS</th>
                <th className="py-1 text-center">YS</th>
                <th className="py-1 text-center">PC &amp; LS</th>
                <th className="py-1 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {input.teachingRows.map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 text-gray-700">{row.center || "—"}</td>
                  <td className="py-1 text-center text-gray-600">{row.normalH}</td>
                  <td className="py-1 text-center text-gray-600">{row.ysH}</td>
                  <td className="py-1 text-center text-gray-600">{row.precompH}</td>
                  <td className="py-1 text-right text-gray-900">{rm(rowTeaching(row))}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-200 font-medium">
                <td className="py-1 text-gray-700" colSpan={4}>
                  Teaching subtotal
                </td>
                <td className="py-1 text-right text-gray-900">{rm(result.teaching)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {input.otherItems.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-400">
              <tr className="border-t border-gray-200">
                <th className="py-1 text-left">Other — center</th>
                <th className="py-1 text-left">Reason</th>
                <th className="py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {input.otherItems.map((item, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 text-gray-700">{item.center || "—"}</td>
                  <td className="py-1 text-gray-600">{item.reason || "—"}</td>
                  <td className="py-1 text-right text-gray-900">{rm(item.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-200 font-medium">
                <td className="py-1 text-gray-700" colSpan={2}>
                  Other subtotal
                </td>
                <td className="py-1 text-right text-gray-900">{rm(result.other)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <div className="mt-5 flex items-center justify-between border-t-2 border-gray-300 pt-3">
          <span className="text-sm font-bold uppercase tracking-wide text-gray-700">
            Grand total
          </span>
          <span className="text-2xl font-extrabold text-brand">{rm(result.grandTotal)}</span>
        </div>
      </Card>
    </div>
  );
}
