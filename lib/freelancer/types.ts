// Domain types for the freelancer monthly payment calculator.
// Faithful to the operator's FREELANCER_CALCULATOR.xlsx: hourly rate by
// (position, center group), a commitment bonus matrix (VLOOKUP-style
// approximate match on both axes), an attendance bonus on fixed hours, and
// payouts grouped per paying company (OT / OTG / PJ / QSM / KM).
//
// Positions reuse the allowance pay tiers (`coaches.allowanceTier` is the
// freelancer position) plus the freelancer-only "CC", which never maps back
// onto a coach's tier — the save-time carry-over skips it.

export const FREELANCER_POSITIONS = [
  "A1",
  "A2",
  "A3",
  "PA",
  "T0",
  "T1",
  "T2",
  "T3",
  "T4",
  "I1",
  "CC",
] as const;

export type FreelancerPosition = (typeof FREELANCER_POSITIONS)[number];

/**
 * Position families for the one-record-per-month rule: a person may hold
 * SEVERAL payment records in the same payout month as long as each sits in a
 * different group (admin A1–A3 / teaching PA–I1 / CC) — re-saving within the
 * same group replaces that group's record.
 */
export const POSITION_GROUPS = {
  admin: ["A1", "A2", "A3"],
  teaching: ["PA", "T0", "T1", "T2", "T3", "T4", "I1"],
  cc: ["CC"],
} as const satisfies Record<string, readonly FreelancerPosition[]>;
export type PositionGroup = keyof typeof POSITION_GROUPS;

export function positionGroupOf(position: FreelancerPosition): PositionGroup {
  if ((POSITION_GROUPS.admin as readonly string[]).includes(position)) return "admin";
  if (position === "CC") return "cc";
  return "teaching";
}

/** Positions whose student result (1 − black/colour) counts; everyone else is 0. */
export const RESULT_POSITIONS = ["T1", "T2", "T3", "T4", "I1"] as const satisfies
  readonly FreelancerPosition[];

/**
 * Positions that never earn the commitment bonus: admin A1–A3, and CC
 * (operator-confirmed 2026-06-12 — CC pays rate + attendance only).
 */
export const NO_COMMITMENT_POSITIONS = ["A1", "A2", "A3", "CC"] as const satisfies
  readonly FreelancerPosition[];

/** RM/hour for one position in each of the two center groups. */
export interface FreelancerRate {
  groupA: number;
  groupB: number;
}

/**
 * Commitment bonus matrix. Both axes use a VLOOKUP-style approximate match:
 * the LARGEST threshold ≤ the value picks the row/column. `values[r][c]` is the
 * multiplier for hour row `r` × result column `c`.
 */
export interface CommitmentMatrix {
  hourThresholds: number[];
  resultThresholds: number[];
  values: number[][];
}

/** One paying company and the centers it pays for. */
export interface FreelancerEntity {
  key: string;
  label: string;
  centers: string[];
}

/** The editable freelancer config, persisted as a singleton row. */
export interface FreelancerConfig {
  rates: Record<FreelancerPosition, FreelancerRate>;
  /** Centers billed at the groupA rate; every other center is groupB. */
  groupACenters: string[];
  commitment: CommitmentMatrix;
  /** Bonus multiplier on FIXED hours when no center row is marked absent. */
  attendanceBonus: number;
  entities: FreelancerEntity[];
}

/** One center's monthly hours for a freelancer. */
export interface FreelancerCenterRow {
  center: string;
  replacedHours: number;
  fixedHours: number;
  absent: boolean;
}

/** A free-form extra payment line, charged to one paying entity. */
export interface FreelancerExtraItem {
  entity: string;
  reason: string;
  amount: number;
}

/** Everything captured for one freelancer's month (stored on the run as `input`). */
export interface FreelancerInput {
  /** Stable coach profile id, if matched. */
  coachId: number | null;
  /** Canonical coach name — the upsert key together with the period. */
  name: string;
  position: FreelancerPosition;
  // Payee details for the bank-transfer file; snapshotted per run and carried
  // back onto the coach profile on save.
  icNo: string;
  bankName: string;
  bankAccount: string;
  centerRows: FreelancerCenterRow[];
  /**
   * The month the WORK belongs to ("YYYY-MM"). Normally equals the payout
   * period; an EARLIER month marks a late submission (补交) — the record is
   * paid in this batch but reported (and KPI-bound) under the work month,
   * exactly like the operator's summary's APRIL rows inside a MAY batch.
   */
  workPeriod?: string | null;
  /** Monthly black-band total (result positions only). */
  blackCount: number;
  /** Monthly colour-band total (result positions only). */
  colourCount: number;
  /**
   * The KPI instructor account this freelancer's student result is bound to
   * (clean name from the month's KPI data). Saved with the run and carried to
   * the next month, where the calculator auto-fills black/colour from that
   * month's KPI upload — the counts stay editable either way. null = manual.
   */
  kpiName?: string | null;
  extras: FreelancerExtraItem[];
}

/** Computed payment breakdown (stored on the run as `result`). */
export interface FreelancerResult {
  /** Σ over centers of (replaced + fixed) hours. */
  totalServiceHours: number;
  /** Student result in [0,1]: 1 − black/colour (0 for non-result positions). */
  result: number;
  /** Commitment bonus multiplier from the matrix. */
  commitment: number;
  /** Attendance bonus multiplier actually applied (0 when any absence). */
  attendance: number;
  centerPayments: { center: string; rate: number; payment: number }[];
  entityTotals: { entity: string; label: string; amount: number }[];
  grandTotal: number;
}
