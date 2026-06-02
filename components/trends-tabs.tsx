"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CommissionTrendsView } from "@/components/commission-trends-view";
import { TeachingTrendsView } from "@/components/teaching-trends-view";
import type { CommissionTrendData, TeachingTrendData } from "@/lib/db/queries";

export function TrendsTabs({
  commission,
  teaching,
}: {
  commission: CommissionTrendData;
  teaching: TeachingTrendData;
}) {
  const [tab, setTab] = useState<"commission" | "coaching">("commission");

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex gap-1 rounded-md border border-gray-200 bg-white p-0.5 text-xs">
          <button
            onClick={() => setTab("commission")}
            className={cn("rounded px-3 py-1 font-medium", tab === "commission" ? "bg-brand text-white" : "text-gray-600")}
          >
            Commission
          </button>
          <button
            onClick={() => setTab("coaching")}
            className={cn("rounded px-3 py-1 font-medium", tab === "coaching" ? "bg-brand text-white" : "text-gray-600")}
          >
            Coaching income
          </button>
        </div>
      </div>
      {tab === "commission" ? <CommissionTrendsView data={commission} /> : <TeachingTrendsView data={teaching} />}
    </div>
  );
}
