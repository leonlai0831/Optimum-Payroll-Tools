"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, Trash2 } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { rm } from "@/lib/utils";
import type { CommissionRunSummary } from "@/lib/db/queries";

export function CommissionHistoryView({ runs }: { runs: CommissionRunSummary[] }) {
  const router = useRouter();
  const toast = useToast();
  const [deleting, setDeleting] = useState<number | null>(null);

  async function remove(id: number, label: string) {
    if (!confirm(`Delete the saved commission run for ${label}? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/commission/runs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Run deleted.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  if (runs.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-gray-500">
        No saved months yet. Compute a month on the Calculator, then “Save to history”.
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left text-overline text-muted">
            <th className="px-3 py-2">Period</th>
            <th className="px-3 py-2">Saved</th>
            <th className="px-3 py-2 text-right">Qualifying</th>
            <th className="px-3 py-2 text-right">Rate</th>
            <th className="px-3 py-2 text-right">Staff</th>
            <th className="px-3 py-2 text-right">Total commission</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {runs.map((r) => (
            <tr key={r.id} className="tabular-nums">
              <td className="px-3 py-2 font-medium text-gray-900">
                <Link href={`/commission/history/${r.id}`} className="hover:text-brand hover:underline">
                  {r.periodLabel}
                </Link>
              </td>
              <td className="px-3 py-2 text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</td>
              <td className="px-3 py-2 text-right text-gray-600">{r.qualifying}</td>
              <td className="px-3 py-2 text-right text-gray-600">{(r.rate * 100).toFixed(0)}%</td>
              <td className="px-3 py-2 text-right text-gray-600">{r.staffCount}</td>
              <td className="px-3 py-2 text-right font-bold text-green-700">{rm(r.totalCommission)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <Link href={`/commission/history/${r.id}`} title="View" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand">
                    <Eye className="h-4 w-4" />
                  </Link>
                  <a href={`/api/commission/runs/${r.id}/export`} title="Download Excel" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-green-700">
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
    </Card>
  );
}
