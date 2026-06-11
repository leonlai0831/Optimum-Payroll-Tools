"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, Trash2 } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { formatDate, rm } from "@/lib/utils";

/** One saved month, pre-mapped by the caller into the shared shape. */
export type RunHistoryRow = {
  id: number;
  periodLabel: string;
  createdAt: Date;
  /** Detail page for the run. */
  href: string;
  /** Excel download endpoint. */
  exportHref: string;
  /** Middle numeric columns (labels must match across rows). */
  stats: { label: string; value: string }[];
  /** Money total for the run (rendered with rm()). */
  total: number;
};

/**
 * Shared saved-months list for the Fit calculators (commission + coaching):
 * cards on phones, the classic table at `lg`+. The caller supplies rows plus
 * the strings/endpoints that differ between the two histories.
 */
export function RunHistoryShell({
  rows,
  totalLabel,
  emptyText,
  deleteUrlBase,
  deletePrompt,
  deletedToast,
}: {
  rows: RunHistoryRow[];
  /** Header for the money column, e.g. "Total commission". */
  totalLabel: string;
  emptyText: string;
  /** DELETE endpoint prefix; the run id is appended. */
  deleteUrlBase: string;
  deletePrompt: (periodLabel: string) => string;
  deletedToast: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [deleting, setDeleting] = useState<number | null>(null);

  async function remove(id: number, label: string) {
    if (!confirm(deletePrompt(label))) return;
    setDeleting(id);
    try {
      const res = await fetch(`${deleteUrlBase}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success(deletedToast);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  if (rows.length === 0) {
    return <Card className="p-8 text-center text-sm text-gray-500">{emptyText}</Card>;
  }

  const statLabels = rows[0].stats.map((s) => s.label);

  return (
    <Card className="overflow-hidden">
      <MobileCards>
        {rows.map((r) => (
          <div key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={r.href} className="font-semibold text-gray-900 hover:text-brand">
                  {r.periodLabel}
                </Link>
                <div className="mt-0.5 text-[11px] text-gray-400">
                  saved {formatDate(r.createdAt)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="nums text-base font-bold text-green-700">{rm(r.total)}</div>
                <div className="text-[11px] text-gray-400">{totalLabel.toLowerCase()}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {r.stats.map((s) => (
                <div key={s.label}>
                  <div className="text-overline text-muted">{s.label}</div>
                  <div className="nums mt-0.5 text-sm text-gray-700">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Link
                href={r.href}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 text-sm font-medium text-brand hover:bg-brand/5 active:bg-brand/10"
              >
                <Eye className="h-4 w-4" /> View
              </Link>
              <a
                href={r.exportHref}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 text-sm font-medium text-green-700 hover:bg-green-50 active:bg-green-100"
              >
                <Download className="h-4 w-4" /> Excel
              </a>
              <button
                onClick={() => remove(r.id, r.periodLabel)}
                disabled={deleting === r.id}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-50"
              >
                {deleting === r.id ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete
              </button>
            </div>
          </div>
        ))}
      </MobileCards>

      <DesktopTable>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-overline text-muted">
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Saved</th>
              {statLabels.map((label) => (
                <th key={label} className="px-3 py-2 text-right">
                  {label}
                </th>
              ))}
              <th className="px-3 py-2 text-right">{totalLabel}</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="tabular-nums">
                <td className="px-3 py-2 font-medium text-gray-900">
                  <Link href={r.href} className="hover:text-brand hover:underline">
                    {r.periodLabel}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-500">{formatDate(r.createdAt)}</td>
                {r.stats.map((s) => (
                  <td key={s.label} className="px-3 py-2 text-right text-gray-600">
                    {s.value}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-bold text-green-700">{rm(r.total)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={r.href} title="View" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand">
                      <Eye className="h-4 w-4" />
                    </Link>
                    <a href={r.exportHref} title="Download Excel" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-green-700">
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => remove(r.id, r.periodLabel)}
                      disabled={deleting === r.id}
                      title="Delete"
                      className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                    >
                      {deleting === r.id ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DesktopTable>
    </Card>
  );
}
