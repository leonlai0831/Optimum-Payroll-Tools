/**
 * Aggregate the actual per-metric values from recent runs, so a target
 * suggestion can be grounded in what coaches really achieved (not guessed).
 * Pure and testable; the AI layer only turns these stats into a recommendation.
 */

export interface MetricValue {
  id: string;
  name: string;
  /** The normalized value used in scoring (same units as the metric min/max). */
  raw: number;
}

export interface MetricStat {
  id: string;
  name: string;
  count: number;
  min: number;
  median: number;
  max: number;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Group a flat list of per-coach metric values by metric id and return the
 * min / median / max distribution for each. Callers flatten the breakdowns of
 * the runs they want to consider and pass them in.
 */
export function aggregateMetricStats(items: MetricValue[]): MetricStat[] {
  const byId = new Map<string, { name: string; values: number[] }>();
  for (const it of items) {
    if (!Number.isFinite(it.raw)) continue;
    const entry = byId.get(it.id) ?? { name: it.name, values: [] };
    entry.values.push(it.raw);
    byId.set(it.id, entry);
  }

  const stats: MetricStat[] = [];
  for (const [id, { name, values }] of byId) {
    if (values.length === 0) continue;
    const sorted = [...values].sort((a, b) => a - b);
    stats.push({
      id,
      name,
      count: sorted.length,
      min: sorted[0],
      median: median(sorted),
      max: sorted[sorted.length - 1],
    });
  }
  return stats;
}
