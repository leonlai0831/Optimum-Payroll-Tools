"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, History, Trash2 } from "lucide-react";
import { Button, Card, Spinner } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { ConfirmModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import type { FreelancerRunSummary } from "@/lib/db/queries";
import { rm2 } from "@/lib/utils";

function DeleteRunButton({ id, name, onDeleted }: { id: number; name: string; onDeleted?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setConfirm(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/freelancer/runs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Delete failed");
      }
      toast.success("Payment record deleted.");
      onDeleted?.();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
        onClick={() => setConfirm(true)}
        disabled={busy}
      >
        {busy ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
      </button>
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
        title={`Delete ${name}?`}
        message="This removes the saved payment record for this month. The freelancer's profile is kept."
        confirmLabel="Delete record"
        busy={busy}
      />
    </>
  );
}

export function FreelancerHistoryView({
  rows,
  canEdit,
}: {
  rows: FreelancerRunSummary[];
  canEdit: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No freelancer payments saved yet"
        body="Compute one on the Calculator tab and click “Save” to start the history."
      />
    );
  }

  // Group by period, newest first (rows arrive ordered by createdAt desc).
  const periodOrder = [...new Set(rows.map((r) => r.periodLabel))];
  const groups = periodOrder.map((p) => rows.filter((r) => r.periodLabel === p));

  return (
    <div className="space-y-4">
      {groups.map((list) => {
        const period = list[0].periodLabel;
        const total = list.reduce((s, r) => s + r.grandTotal, 0);
        return (
          <Card key={period} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900">{period}</span>
                <span className="text-xs text-gray-500">
                  {list.length} freelancer(s) · total {rm2(total)}
                </span>
              </div>
              {canEdit && (
                <a
                  href={`/api/freelancer/export?period=${encodeURIComponent(period)}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                  title="Download the bank-transfer file (one sheet per paying company)"
                >
                  <Download className="h-3.5 w-3.5" /> Bank file
                </a>
              )}
            </div>
            <MobileCards>
              {list.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-900">{r.canonicalName}</div>
                      <div className="mt-0.5 text-[11px] text-gray-400">
                        {r.position}
                        {r.workPeriod !== r.periodLabel && (
                          <span className="text-warning"> · for {r.workPeriod}</span>
                        )}{" "}
                        · {r.totalServiceHours} h · commitment +
                        {(r.commitment * 100).toFixed(0)}%
                        {r.attendance > 0 ? ` · attendance +${(r.attendance * 100).toFixed(0)}%` : ""}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-gray-400">
                        {r.entityTotals
                          .filter((e) => e.amount > 0)
                          .map((e) => `${e.label} ${rm2(e.amount)}`)
                          .join(" · ") || "no payout"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-base font-bold tabular-nums text-green-700">
                        {rm2(r.grandTotal)}
                      </div>
                      <div className="text-[11px] text-gray-400">total</div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {canEdit && (
                      <Link
                        href={`/freelancer?edit=${r.id}`}
                        className="flex-1 rounded-md border border-gray-200 py-2 text-center text-sm font-medium text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100"
                      >
                        Edit
                      </Link>
                    )}
                    <Link
                      href={`/freelancer/history/${r.id}`}
                      className="flex-1 rounded-md border border-gray-200 py-2 text-center text-sm font-medium text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100"
                    >
                      View
                    </Link>
                    {canEdit && (
                      <span className="flex flex-1 items-center justify-center rounded-md border border-gray-200 py-2">
                        <DeleteRunButton id={r.id} name={r.canonicalName} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </MobileCards>
            <DesktopTable>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Freelancer</th>
                    <th className="px-4 py-2 text-left">Position</th>
                    <th className="px-4 py-2 text-right">Hours</th>
                    <th className="px-4 py-2 text-right">Commit.</th>
                    <th className="px-4 py-2 text-right">Attend.</th>
                    <th className="px-4 py-2 text-left">Paid by</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {list.map((r) => (
                    <tr key={r.id} className="hover:bg-indigo-50/40">
                      <td className="px-4 py-2 font-medium text-gray-900">{r.canonicalName}</td>
                      <td className="px-4 py-2 text-gray-600">
                        {r.position}
                        {r.workPeriod !== r.periodLabel && (
                          <span className="ml-1 text-xs text-warning">for {r.workPeriod}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                        {r.totalServiceHours}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                        +{(r.commitment * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                        +{(r.attendance * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {r.entityTotals
                          .filter((e) => e.amount > 0)
                          .map((e) => `${e.label} ${rm2(e.amount)}`)
                          .join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-green-700">
                        {rm2(r.grandTotal)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {canEdit && (
                            <Link
                              href={`/freelancer?edit=${r.id}`}
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                            >
                              Edit
                            </Link>
                          )}
                          <Link
                            href={`/freelancer/history/${r.id}`}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            View
                          </Link>
                          {canEdit && <DeleteRunButton id={r.id} name={r.canonicalName} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DesktopTable>
          </Card>
        );
      })}
    </div>
  );
}

/** Header action used on the run detail page (mirrors DeleteAllowanceRunButton). */
export function DeleteFreelancerRunButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setConfirm(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/freelancer/runs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/freelancer/history");
      router.refresh();
    } catch {
      toast.error("Delete failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" className="text-red-600" onClick={() => setConfirm(true)} disabled={busy}>
        {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Delete
      </Button>
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
        title={`Delete ${name}?`}
        message="This removes the saved payment record for this month. The freelancer's profile is kept."
        confirmLabel="Delete record"
        busy={busy}
      />
    </>
  );
}
