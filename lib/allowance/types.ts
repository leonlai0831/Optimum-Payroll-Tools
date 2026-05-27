// Domain types for the full-time teaching allowance calculator.
// Independent of the KPI engine — the only shared concept is coach identity
// (coachId / canonicalName), used to auto-link the teaching subtotal into KPI.

/** Pay tiers (distinct from KPI `Position`). Admin tiers A1–A3 earn attendance only. */
export const ALLOWANCE_TIERS = [
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
  "I2",
  "I3",
] as const;

export type AllowanceTier = (typeof ALLOWANCE_TIERS)[number];

/**
 * Known operating centers (short codes). Single source of truth for the center
 * dropdowns across the allowance UI. To add a center, add it here.
 */
export const CENTERS = ["HQ", "BK", "BT", "PK", "PJ", "KK", "USJ", "QSM", "KM"] as const;

export type Center = (typeof CENTERS)[number];

/** Attendance allowance amounts (RM) per performance bracket. */
export interface AttendanceAmounts {
  /** 95% ≤ attendance < 100%. */
  met: number;
  /** Exactly 100% attendance (no leave). */
  perfect: number;
}

/** Per-hour teaching rates (RM) by class type. */
export interface TeachingRates {
  normal: number;
  youngSwimmer: number;
  precompLifesaving: number;
}

/** The two editable rate tables, persisted as the allowance config singleton. */
export interface AllowanceConfig {
  attendance: Record<AllowanceTier, AttendanceAmounts>;
  teaching: Record<AllowanceTier, TeachingRates>;
}

/** One center's monthly teaching hours, split by class type. */
export interface TeachingHoursRow {
  center: string;
  normalH: number;
  ysH: number;
  precompH: number;
}

/** A free-form additional allowance line. */
export interface OtherAllowanceItem {
  center: string;
  reason: string;
  amount: number;
}

/** Everything captured for one coach's month (stored on the run as `input`). */
export interface AllowanceInput {
  /** Stable coach profile id, if matched. */
  coachId: number | null;
  /** Canonical coach name — the join key into KPI when coachId is absent. */
  name: string;
  tier: AllowanceTier;
  center: string;
  opHours: number;
  leaveHours: number;
  teachingRows: TeachingHoursRow[];
  otherItems: OtherAllowanceItem[];
}

/** Computed allowance breakdown (stored on the run as `result`). */
export interface AllowanceResult {
  /** Attendance ratio in [0,1]. */
  attendancePct: number;
  attendance: number;
  /** Teaching subtotal — the figure auto-linked into the KPI bonus. */
  teaching: number;
  other: number;
  grandTotal: number;
}
