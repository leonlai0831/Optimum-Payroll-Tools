"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommissionHistoryView } from "@/components/commission-history-view";
import { TeachingHistoryView } from "@/components/teaching-history-view";
import type { CommissionRunSummary, TeachingRunSummary } from "@/lib/db/queries";

export function HistoryTabs({
  commissionRuns,
  teachingRuns,
}: {
  commissionRuns: CommissionRunSummary[];
  teachingRuns: TeachingRunSummary[];
}) {
  const [tab, setTab] = useState<"commission" | "coaching">("commission");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <History className="h-5 w-5 text-brand" /> Saved months
        </h1>
        <div className="flex gap-1 rounded-md border border-gray-200 bg-white p-0.5 text-xs">
          <button
            onClick={() => setTab("commission")}
            className={cn("rounded px-3 py-1 font-medium", tab === "commission" ? "bg-brand text-white" : "text-gray-600")}
          >
            Commission ({commissionRuns.length})
          </button>
          <button
            onClick={() => setTab("coaching")}
            className={cn("rounded px-3 py-1 font-medium", tab === "coaching" ? "bg-brand text-white" : "text-gray-600")}
          >
            Coaching income ({teachingRuns.length})
          </button>
        </div>
      </div>
      {tab === "commission" ? (
        <CommissionHistoryView runs={commissionRuns} />
      ) : (
        <TeachingHistoryView runs={teachingRuns} />
      )}
    </div>
  );
}
