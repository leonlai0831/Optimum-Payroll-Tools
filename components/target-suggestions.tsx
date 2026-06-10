"use client";

import { useState } from "react";
import { Sparkles, Target } from "lucide-react";
import { Button, Card, Spinner } from "@/components/ui";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { fetchJson } from "@/lib/http";

interface TargetStat {
  name: string;
  currentMin: number;
  currentMax: number;
  achievedMin: number;
  achievedMedian: number;
  achievedMax: number;
  count: number;
}

/**
 * On-demand KPI target suggestions, grounded in the actual distribution of recent
 * results. Advisory only: it shows recommendations and the numbers behind them —
 * the manager still edits the targets in the form below. Nothing auto-applies.
 */
export function TargetSuggestions() {
  const [data, setData] = useState<{ stats: TargetStat[]; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await fetchJson<{ stats?: TargetStat[]; text?: string }>("/api/suggest-targets");
      setData({ stats: d.stats ?? [], text: d.text ?? "" });
    } catch {
      setData({ stats: [], text: "Could not generate suggestions right now." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Target className="h-4 w-4 text-accent" /> Suggest targets from recent data
        </span>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? "Analyzing…" : data ? "Refresh" : "Suggest"}
        </Button>
      </div>

      {data && (
        <div className="mt-3 space-y-3">
          {data.stats.length > 0 && (
            <>
              {/* Mobile (< lg): one hairline-divided card per metric. */}
              <MobileCards className="rounded-lg border border-gray-100">
                {data.stats.map((s) => (
                  <div key={s.name} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800">{s.name}</span>
                      <span className="nums shrink-0 text-[11px] text-gray-400">n = {s.count}</span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-overline text-muted">Current</span>
                        <div className="nums mt-0.5 text-xs text-gray-700">
                          {s.currentMin}–{s.currentMax}
                        </div>
                      </div>
                      <div>
                        <span className="text-overline text-muted">Achieved (min/med/max)</span>
                        <div className="nums mt-0.5 text-xs text-gray-700">
                          {s.achievedMin.toFixed(2)} / {s.achievedMedian.toFixed(2)} /{" "}
                          {s.achievedMax.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </MobileCards>
              {/* Desktop (lg+): compact stats table. */}
              <DesktopTable>
                <table className="min-w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Metric</th>
                      <th className="px-2 py-1 text-center font-medium">Current</th>
                      <th className="px-2 py-1 text-center font-medium">Achieved (min/med/max)</th>
                      <th className="px-2 py-1 text-center font-medium">n</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700">
                    {data.stats.map((s) => (
                      <tr key={s.name} className="border-t border-gray-100">
                        <td className="px-2 py-1 font-medium">{s.name}</td>
                        <td className="px-2 py-1 text-center">
                          {s.currentMin}–{s.currentMax}
                        </td>
                        <td className="px-2 py-1 text-center">
                          {s.achievedMin.toFixed(2)} / {s.achievedMedian.toFixed(2)} /{" "}
                          {s.achievedMax.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-center text-gray-400">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DesktopTable>
            </>
          )}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{data.text}</p>
          <p className="text-[11px] text-gray-400">
            Suggestions only — review and apply any changes in the targets below.
          </p>
        </div>
      )}
    </Card>
  );
}
