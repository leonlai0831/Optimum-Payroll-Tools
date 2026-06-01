/**
 * Transparent retention "watch" signals from KPI score history.
 *
 * IMPORTANT — this is deliberately NOT a black-box attrition predictor. It only
 * surfaces *explainable* patterns in a coach's own KPI scores (a sustained
 * decline, or a large drop from their peak) so a manager can have a supportive
 * check-in. It is NOT a judgement about whether someone will leave, and the only
 * data it uses is the KPI score — every flag carries the exact numbers behind it.
 * Treat it as advisory, never as a basis for an employment decision.
 */

export interface RetentionPoint {
  period: string;
  score: number;
}

export interface RetentionInput {
  name: string;
  points: RetentionPoint[];
}

export interface RetentionWatch {
  name: string;
  /** "elevated" = larger sustained drop; "watch" = milder. Advisory only. */
  level: "watch" | "elevated";
  direction: "declining" | "volatile";
  /** Drop from the coach's peak score to their latest, as a negative number. */
  changeFromPeak: number;
  /** Plain-language, fully transparent reasons (the actual numbers). */
  reasons: string[];
  points: RetentionPoint[];
}

const MIN_POINTS = 3;
const WATCH_DROP = 0.15; // drop from peak to flag at all
const ELEVATED_DROP = 0.25; // drop from peak to flag as elevated

/** Standard deviation of the scores (volatility signal). */
function stdev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

/**
 * Return only the coaches whose KPI history shows a real, explainable decline or
 * high volatility. Each result includes the numbers behind the flag.
 */
export function retentionWatch(coaches: RetentionInput[]): RetentionWatch[] {
  const out: RetentionWatch[] = [];

  for (const coach of coaches) {
    const pts = coach.points;
    if (pts.length < MIN_POINTS) continue;

    const scores = pts.map((p) => p.score);
    const latest = pts[pts.length - 1];

    // Peak (highest score) and its period, to measure how far they've fallen.
    let peakIdx = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[peakIdx]) peakIdx = i;
    const peak = pts[peakIdx];
    const changeFromPeak = latest.score - peak.score;

    // A sustained recent decline: the last 3 readings strictly decreasing.
    const last3 = scores.slice(-3);
    const decliningRun = last3.length === 3 && last3[0] > last3[1] && last3[1] > last3[2];

    const volatility = stdev(scores);
    const reasons: string[] = [];

    const droppedFromPeak = peakIdx < pts.length - 1 && changeFromPeak <= -WATCH_DROP;
    if (droppedFromPeak) {
      reasons.push(
        `Score fell from ${peak.score.toFixed(2)} (${peak.period}) to ${latest.score.toFixed(2)} (${latest.period}), down ${Math.abs(changeFromPeak).toFixed(2)}.`,
      );
    }
    if (decliningRun) {
      reasons.push(
        `Declined for 3 readings in a row: ${last3.map((s) => s.toFixed(2)).join(" → ")}.`,
      );
    }
    const volatile = !droppedFromPeak && !decliningRun && volatility >= 0.2;
    if (volatile) {
      reasons.push(`Scores have been volatile (variation ±${volatility.toFixed(2)}).`);
    }

    if (reasons.length === 0) continue;

    out.push({
      name: coach.name,
      level: changeFromPeak <= -ELEVATED_DROP ? "elevated" : "watch",
      direction: volatile ? "volatile" : "declining",
      changeFromPeak,
      reasons,
      points: pts,
    });
  }

  // Most concerning first: biggest drop from peak.
  return out.sort((a, b) => a.changeFromPeak - b.changeFromPeak);
}
