"use client";

import { RunHistoryShell } from "@/components/run-history-shell";
import type { CommissionRunSummary } from "@/lib/db/queries";

export function CommissionHistoryView({ runs }: { runs: CommissionRunSummary[] }) {
  return (
    <RunHistoryShell
      rows={runs.map((r) => ({
        id: r.id,
        periodLabel: r.periodLabel,
        createdAt: r.createdAt,
        href: `/commission/history/${r.id}`,
        exportHref: `/api/commission/runs/${r.id}/export`,
        stats: [
          { label: "Qualifying", value: String(r.qualifying) },
          { label: "Rate", value: `${(r.rate * 100).toFixed(0)}%` },
          { label: "Staff", value: String(r.staffCount) },
        ],
        total: r.totalCommission,
      }))}
      totalLabel="Total commission"
      emptyText="No saved months yet. Compute a month on the Calculator, then “Save to history”."
      deleteUrlBase="/api/commission/runs"
      deletePrompt={(label) => `Delete the saved commission run for ${label}? This cannot be undone.`}
      deletedToast="Run deleted."
    />
  );
}
