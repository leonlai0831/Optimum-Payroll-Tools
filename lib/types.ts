import type { BreakdownItem } from "./kpi/types";

export type Position = "Instructor" | "Pool Supervisor";

/** Supervisor group/center-hours configuration for a coach in a given month. */
export interface GroupConfig {
  center1: string;
  hours1: number;
  center2?: string;
  hours2?: number;
}

/** One merged coach within a saved monthly run (stored as jsonb on the run). */
export interface RunCoach {
  /** Stable coach profile id, if matched. */
  coachId: number | null;
  canonicalName: string;
  /** Original CSV account names merged into this coach. */
  accounts: string[];
  center: string;
  position: Position;
  /** Manual inputs for this month. */
  teachingAllowance: number | null;
  mgmtAssessment: number | null;
  groupConfig: GroupConfig | null;
  /** Computed outputs (present once inputs are complete). */
  students: number;
  personalScore: number;
  groupScore: number;
  finalScore: number;
  grade: string;
  payout: number;
  breakdown: BreakdownItem[];
  /** Whether required manual inputs are present. */
  isComplete: boolean;
}
