"use client";

import { RunHistoryShell } from "@/components/run-history-shell";
import { rm } from "@/lib/utils";
import type { TeachingRunSummary } from "@/lib/db/queries";

export function TeachingHistoryView({ runs }: { runs: TeachingRunSummary[] }) {
  return (
    <RunHistoryShell
      rows={runs.map((r) => ({
        id: r.id,
        periodLabel: r.periodLabel,
        createdAt: r.createdAt,
        href: `/commission/history/teaching/${r.id}`,
        exportHref: `/api/teaching/runs/${r.id}/export`,
        stats: [
          { label: "Coaches", value: String(r.coachCount) },
          { label: "PT income", value: rm(r.ptIncome) },
          { label: "Group income", value: rm(r.groupIncome) },
        ],
        total: r.totalIncome,
      }))}
      totalLabel="Total income"
      emptyText="No saved coaching months yet. Compute a month on Coaching income, then “Save to history”."
      deleteUrlBase="/api/teaching/runs"
      deletePrompt={(label) => `Delete the saved coaching income for ${label}? This cannot be undone.`}
      deletedToast="Coaching month deleted."
    />
  );
}
