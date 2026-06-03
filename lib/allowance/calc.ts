import type {
  AllowanceConfig,
  AllowanceInput,
  AllowanceResult,
  AllowanceTier,
  OtherAllowanceItem,
  TeachingHoursRow,
} from "./types";

/** Minimum attendance to earn anything; strictly below this collapses to RM0. */
export const ATT_MIN = 0.95;
/** Exactly 100% earns the higher "perfect" amount. */
export const ATT_PERFECT = 1.0;
/**
 * Float tolerance. Integer hour ratios that are mathematically exactly 0.95
 * (e.g. 1 − 8/160) land ~1e-16 *below* 0.95 in IEEE-754, which would wrongly
 * drop them under the cliff. A 1e-9 epsilon restores the intended boundary
 * without promoting genuine sub-95% values (integer ratios differ by ≥ 1/op).
 */
const EPS = 1e-9;

/** Attendance ratio in [0,1]; guards a non-positive operating-hours denominator. */
export function attendancePercentage(opHours: number, leaveHours: number): number {
  if (!(opHours > 0)) return 0;
  return 1 - leaveHours / opHours;
}

/** Which attendance bracket a ratio falls in. */
export function attendanceBracket(pct: number): "none" | "met" | "perfect" {
  if (pct >= ATT_PERFECT - EPS) return "perfect";
  if (pct >= ATT_MIN - EPS) return "met";
  return "none";
}

export function attendanceAllowance(
  tier: AllowanceTier,
  pct: number,
  cfg: AllowanceConfig,
): number {
  const amounts = cfg.attendance[tier];
  switch (attendanceBracket(pct)) {
    case "perfect":
      return amounts.perfect;
    case "met":
      return amounts.met;
    default:
      return 0;
  }
}

export function teachingAllowance(
  tier: AllowanceTier,
  rows: TeachingHoursRow[],
  cfg: AllowanceConfig,
): number {
  const rates = cfg.teaching[tier];
  return rows.reduce(
    (sum, r) =>
      sum +
      r.normalH * rates.normal +
      r.ysH * rates.youngSwimmer +
      r.precompH * rates.precompLifesaving,
    0,
  );
}

export function otherTotal(items: OtherAllowanceItem[]): number {
  return items.reduce((sum, i) => sum + (Number.isFinite(i.amount) ? i.amount : 0), 0);
}

/** Full breakdown for one coach's month. */
export function calcAllowance(input: AllowanceInput, cfg: AllowanceConfig): AllowanceResult {
  const attendancePct = attendancePercentage(input.opHours, input.leaveHours);
  const attendance = attendanceAllowance(input.tier, attendancePct, cfg);
  const teaching = teachingAllowance(input.tier, input.teachingRows, cfg);
  const other = otherTotal(input.otherItems);
  return {
    attendancePct,
    attendance,
    teaching,
    other,
    grandTotal: attendance + teaching + other,
  };
}
