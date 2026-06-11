import { METRIC_LIBRARY, type MetricContext } from "./metrics";
import type {
  AggData,
  BreakdownItem,
  CenterTargets,
  Grade,
  GradeThresholds,
  InstructorRow,
  MetricConfig,
  MetricMode,
  ScoreResult,
} from "./types";

/**
 * Score a single metric value into a multiplier (typically 0.5..1.5).
 * Ported exactly from KPI_Calculator_v11.1 `calcMetricScore` for the
 * "growth" and "standard" modes. "lower" mirrors "standard" for opt-in
 * lower-is-better metrics (does not affect the v11.1 defaults).
 */
export function calcMetricScore(
  val: number,
  min: number,
  max: number,
  mode: MetricMode = "standard",
): number {
  if (mode === "growth") {
    // Guard a non-positive baseline BEFORE the log branch: dividing by `min`
    // when min <= 0 would yield Infinity/NaN. A 0 (or negative) min has no
    // meaningful baseline to grow from, so treat any positive value as fully
    // achieving the target (cap at 1.5, the same ceiling as `standard`) and a
    // non-positive value as 0. The growth curve is "uncapped" only for a real
    // positive baseline.
    if (min <= 0) return val > 0 ? 1.5 : 0;
    if (val <= min) return val / min;
    return 1 + 0.72 * Math.log((val - min) / min + 1);
  }
  if (mode === "lower") {
    if (val <= min) return 1.5;
    if (val >= max) return 0.5;
    const t = (val - min) / (max - min);
    return 1.5 - Math.pow(t, 1.5) * 0.5;
  }
  // standard
  if (val < min) return 0.5;
  if (val >= max) return 1.5;
  const t = (val - min) / (max - min);
  return 1 + Math.pow(t, 1.5) * 0.5;
}

const EMPTY_AGG: AggData = {
  TotalStudent: 0,
  TotalColor: 0,
  Black: 0,
  LevelUp: 0,
  Downgrade: 0,
  Switch: 0,
  Stop: 0,
  Attended: 0,
};

/** Sum raw counters across the given rows. */
export function aggregateRows(rows: InstructorRow[]): AggData {
  return rows.reduce<AggData>(
    (acc, r) => ({
      TotalStudent: acc.TotalStudent + r.TotalStudent,
      TotalColor: acc.TotalColor + r.TotalColor,
      Black: acc.Black + r.Black,
      LevelUp: acc.LevelUp + r.LevelUp,
      Downgrade: acc.Downgrade + r.Downgrade,
      Switch: acc.Switch + r.Switch,
      Stop: acc.Stop + r.Stop,
      Attended: acc.Attended + r.Attended,
    }),
    { ...EMPTY_AGG },
  );
}

/** Aggregate the rows belonging to a set of original instructor account names. */
export function aggregateData(
  rows: InstructorRow[],
  originalNames: string[],
): AggData {
  const set = new Set(originalNames);
  return aggregateRows(rows.filter((r) => set.has(r.Instructor)));
}

/**
 * Compute the weighted score + per-metric breakdown for an aggregate.
 * Faithful to v11.1: percent metrics are normalized to match the config's
 * min/max scale; weights are summed without renormalization (the Settings
 * UI enforces enabled weights total 100%).
 */
export function calculateScores(
  agg: AggData,
  config: MetricConfig[],
  mgmtRating = 80,
): ScoreResult {
  let rating = mgmtRating;
  if (rating <= 1 && rating > 0) rating = rating * 100; // accept 0.85 or 85

  const ctx: MetricContext = { mgmtRating: rating };
  let totalScore = 0;
  const breakdown: BreakdownItem[] = [];

  for (const conf of config) {
    if (!conf.enabled) continue;
    const def = METRIC_LIBRARY[conf.id];
    if (!def) continue;

    const rawVal = def.extract(agg, ctx);
    let calcVal = rawVal;
    let displayValNum = rawVal;
    const calcMin = conf.min;

    if (conf.type === "percent") {
      if (calcMin > 1 && calcVal <= 1) calcVal = calcVal * 100;
      if (calcMin <= 1 && calcVal > 1) calcVal = calcVal / 100;
      if (displayValNum <= 1) displayValNum = displayValNum * 100;
    }

    const score = calcMetricScore(calcVal, conf.min, conf.max, def.mode);
    totalScore += score * conf.w;

    breakdown.push({
      id: conf.id,
      name: conf.name,
      type: conf.type,
      min: conf.min,
      max: conf.max,
      w: conf.w,
      raw: calcVal,
      displayValue:
        conf.type === "percent"
          ? `${displayValNum.toFixed(2)}%`
          : rawVal.toFixed(2),
      score,
    });
  }

  return { totalScore, breakdown };
}

export function getGrade(
  score: number,
  thresholds: GradeThresholds,
): Grade {
  if (score >= thresholds.S)
    return { grade: "S", className: "bg-accent text-[#312b29] border-[#e0a020]" };
  if (score >= thresholds.A)
    return { grade: "A", className: "bg-indigo-100 text-indigo-800 border-indigo-300" };
  if (score >= thresholds.B)
    return { grade: "B", className: "bg-amber-100 text-amber-800 border-amber-300" };
  return { grade: "C", className: "bg-red-100 text-red-800 border-red-300" };
}

/**
 * Resolve a center's student target: exact (case-insensitive), then a
 * whole-word/token match in BOTH directions, else the documented default 140.
 *
 * Token matching (rather than raw substring) means "Puchong Kinrara" and
 * "Kinrara" resolve to each other, while a short code like "HQ" no longer
 * spuriously matches an unrelated key such as "PHQ". CSV center names CAN be
 * shorter than the configured key (operator-confirmed), so the name⊆key
 * direction stays — but when several keys match, the winner is chosen
 * DETERMINISTICALLY by closeness instead of config insertion order: most
 * shared tokens first (a more specific key beats a vaguer one), then fewest
 * unmatched tokens (the smallest superset), then alphabetical as a stable
 * final tie-break. A supervisor's group score is computed against this target
 * (min = target, max = 2×target), so a wrong pick changes a real payout.
 */
export function getCenterTarget(name: string, targets: CenterTargets): number {
  const key = name.toLowerCase().trim();
  if (!key) return 140;

  const tokens = (s: string) => s.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const nameTokens = new Set(tokens(key));

  // 1. Exact (case-insensitive) match.
  for (const [k, v] of Object.entries(targets)) {
    if (k.toLowerCase().trim() === key) return v;
  }

  // 2. Token containment in either direction, best candidate wins.
  let best: { k: string; v: number; overlap: number; extra: number } | null = null;
  for (const [k, v] of Object.entries(targets)) {
    const keyTokens = tokens(k);
    if (keyTokens.length === 0) continue;
    const keySet = new Set(keyTokens);
    const keyInName = keyTokens.every((t) => nameTokens.has(t));
    const nameInKey = [...nameTokens].every((t) => keySet.has(t));
    if (!keyInName && !nameInKey) continue;
    const overlap = [...nameTokens].filter((t) => keySet.has(t)).length;
    const extra = keySet.size + nameTokens.size - 2 * overlap;
    const lower = k.toLowerCase().trim();
    if (
      !best ||
      overlap > best.overlap ||
      (overlap === best.overlap && extra < best.extra) ||
      (overlap === best.overlap && extra === best.extra && lower < best.k)
    ) {
      best = { k: lower, v, overlap, extra };
    }
  }
  if (best) return best.v;

  return 140;
}

/** Score a single center using center KPI config, with student target applied. */
function computeCenterScore(
  rows: InstructorRow[],
  centerName: string,
  centerKpi: MetricConfig[],
  target: number,
): number {
  const agg = aggregateRows(rows.filter((r) => r.Center === centerName));
  const cfg = centerKpi.map((c) =>
    c.id === "student_number" ? { ...c, min: target, max: target * 2 } : { ...c },
  );
  return calculateScores(agg, cfg, 0).totalScore;
}

export interface GroupScoreInput {
  rows: InstructorRow[];
  centerKpi: MetricConfig[];
  centerTargets: CenterTargets;
  center1: string;
  hours1: number;
  center2?: string;
  hours2?: number;
}

/** Weighted group score across one or two centers by hours (out of 40). */
export function computeGroupScore(input: GroupScoreInput): number {
  const { rows, centerKpi, centerTargets, center1, hours1, center2, hours2 } = input;
  if (!center1) return 0;
  const t1 = getCenterTarget(center1, centerTargets);
  let score = computeCenterScore(rows, center1, centerKpi, t1) * (hours1 / 40);
  if (center2) {
    const t2 = getCenterTarget(center2, centerTargets);
    score += computeCenterScore(rows, center2, centerKpi, t2) * ((hours2 ?? 0) / 40);
  }
  return score;
}
