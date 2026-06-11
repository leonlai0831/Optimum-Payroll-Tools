// Domain types for the freelancer monthly payment calculator.
// Faithful to the operator's FREELANCER_CALCULATOR.xlsx: hourly rate by
// (position, center group), a commitment bonus matrix (VLOOKUP-style
// approximate match on both axes), an attendance bonus on fixed hours, and
// payouts grouped per paying company (OT / OTG / PJ / QSM / KM).
//
// Positions deliberately REUSE the allowance pay tiers (`coaches.allowanceTier`
// is the freelancer position) — no separate position column exists.

import type { AllowanceTier } from "@/lib/allowance/types";

/** Freelancer positions: the AllowanceTier subset that freelancers are hired on. */
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
] as const satisfies readonly AllowanceTier[];

export type FreelancerPosition = (typeof FREELANCER_POSITIONS)[number];

/** Positions whose student result (1 − black/colour) counts; everyone else is 0. */
export const RESULT_POSITIONS = ["T1", "T2", "T3", "T4", "I1"] as const satisfies
  readonly FreelancerPosition[];

/** Admin positions that never earn the commitment bonus. */
export const NO_COMMITMENT_POSITIONS = ["A1", "A2", "A3"] as const satisfies
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
  /** Monthly black-band total (result positions only). */
  blackCount: number;
  /** Monthly colour-band total (result positions only). */
  colourCount: number;
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
