import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getConfig, listRuns, getRun } from "@/lib/db/queries";
import { aggregateMetricStats, type MetricValue } from "@/lib/kpi/metric-stats";
import { suggestTargets, type TargetStat } from "@/lib/ai/anthropic";

const MAX_RUNS = 3; // recent finalized months to base the distribution on

/**
 * GET KPI target suggestions grounded in the actual distribution of recent
 * results. Deterministic aggregation (lib/kpi/metric-stats.ts); the AI only
 * recommends adjustments. Advisory only — nothing is written to config here.
 */
export async function GET() {
  const denied = await requireCapability("edit_settings");
  if (denied) return denied;

  const config = await getConfig();
  const summaries = await listRuns();
  const finalizedIds = summaries
    .filter((r) => r.status === "finalized")
    .slice(0, MAX_RUNS)
    .map((r) => r.id);

  const runs = await Promise.all(finalizedIds.map((id) => getRun(id)));
  const values: MetricValue[] = [];
  for (const run of runs) {
    if (!run) continue;
    for (const coach of run.coachResults) {
      for (const b of coach.breakdown) values.push({ id: b.id, name: b.name, raw: b.raw });
    }
  }

  const stats = aggregateMetricStats(values);
  const byId = new Map(stats.map((s) => [s.id, s]));

  // Only suggest for enabled metrics we actually have data for.
  const targetStats: TargetStat[] = config.personalKpi
    .filter((m) => m.enabled && byId.has(m.id))
    .map((m) => {
      const s = byId.get(m.id)!;
      return {
        name: m.name,
        currentMin: m.min,
        currentMax: m.max,
        achievedMin: s.min,
        achievedMedian: s.median,
        achievedMax: s.max,
        count: s.count,
      };
    });

  const text = await suggestTargets(targetStats);
  return NextResponse.json({ stats: targetStats, text });
}
