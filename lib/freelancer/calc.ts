import {
  NO_COMMITMENT_POSITIONS,
  RESULT_POSITIONS,
  type FreelancerConfig,
  type FreelancerInput,
  type FreelancerPosition,
  type FreelancerResult,
} from "./types";

/** Round ringgit to 2dp (used at the END only — intermediates stay exact). */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** RM/hour for `position` at `center`: groupA when listed, groupB otherwise. */
export function rateFor(
  position: FreelancerPosition,
  center: string,
  cfg: FreelancerConfig,
): number {
  const rate = cfg.rates[position];
  if (!rate) return 0;
  const key = center.trim().toLowerCase();
  const inGroupA = cfg.groupACenters.some((c) => c.trim().toLowerCase() === key);
  return inGroupA ? rate.groupA : rate.groupB;
}

/**
 * Student result in [0,1]: `1 − black/colour`. Only the senior teaching
 * positions (T1–T4, I1) carry a result; everyone else is forced to 0.
 */
export function resultRate(
  position: FreelancerPosition,
  blackCount: number,
  colourCount: number,
): number {
  if (!(RESULT_POSITIONS as readonly string[]).includes(position)) return 0;
  if (!(colourCount > 0)) return 0;
  return 1 - blackCount / colourCount;
}

/** VLOOKUP approximate match: index of the LARGEST threshold ≤ value (0 floor). */
function approxIndex(thresholds: number[], value: number): number {
  let idx = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]) idx = i;
  }
  return idx;
}

/**
 * Commitment bonus multiplier: matrix lookup on (total service hours, result),
 * approximate match on both axes. Admin positions (A1–A3) never earn it.
 */
export function commitmentFor(
  position: FreelancerPosition,
  totalServiceHours: number,
  result: number,
  cfg: FreelancerConfig,
): number {
  if ((NO_COMMITMENT_POSITIONS as readonly string[]).includes(position)) return 0;
  const { hourThresholds, resultThresholds, values } = cfg.commitment;
  const r = approxIndex(hourThresholds, totalServiceHours);
  const c = approxIndex(resultThresholds, result);
  return values[r]?.[c] ?? 0;
}

/** Full payment breakdown for one freelancer's month. */
export function calcFreelancer(input: FreelancerInput, cfg: FreelancerConfig): FreelancerResult {
  const totalServiceHours = input.centerRows.reduce(
    (sum, r) => sum + r.replacedHours + r.fixedHours,
    0,
  );
  const result = resultRate(input.position, input.blackCount, input.colourCount);
  const commitment = commitmentFor(input.position, totalServiceHours, result, cfg);
  // Attendance bonus applies to FIXED hours only, and only when no center row
  // is marked absent that month.
  const attendance = input.centerRows.some((r) => r.absent) ? 0 : cfg.attendanceBonus;

  // Exact per-center payments (rounded only in the output below).
  const exactByCenter = input.centerRows.map((row) => {
    const rate = rateFor(input.position, row.center, cfg);
    const payment =
      rate * (row.replacedHours * (1 + commitment) + row.fixedHours * (1 + commitment + attendance));
    return { center: row.center, rate, payment };
  });

  const extraTotal = (entityKey: string) =>
    input.extras.reduce(
      (sum, e) => sum + (e.entity === entityKey && Number.isFinite(e.amount) ? e.amount : 0),
      0,
    );

  const exactEntityTotals = cfg.entities.map((entity) => {
    const centerKeys = new Set(entity.centers.map((c) => c.trim().toLowerCase()));
    const centersSum = exactByCenter.reduce(
      (sum, c) => (centerKeys.has(c.center.trim().toLowerCase()) ? sum + c.payment : sum),
      0,
    );
    return { entity: entity.key, label: entity.label, amount: centersSum + extraTotal(entity.key) };
  });

  return {
    totalServiceHours,
    result,
    commitment,
    attendance,
    centerPayments: exactByCenter.map((c) => ({ ...c, payment: round2(c.payment) })),
    entityTotals: exactEntityTotals.map((e) => ({ ...e, amount: round2(e.amount) })),
    grandTotal: round2(exactEntityTotals.reduce((sum, e) => sum + e.amount, 0)),
  };
}
