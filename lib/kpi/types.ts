// Core domain types for the KPI engine. Ported from KPI_Calculator_v11.1.html.

import type { ClassifyConfig } from "./classify";

/** A single parsed CSV row, after header mapping to canonical fields. */
export interface InstructorRow {
  Center: string;
  Instructor: string;
  TotalStudent: number;
  TotalColor: number;
  Black: number;
  LevelUp: number;
  Downgrade: number;
  Switch: number;
  Stop: number;
  Attended: number;
}

/** Aggregated raw counters across one or more instructor accounts. */
export interface AggData {
  TotalStudent: number;
  TotalColor: number;
  Black: number;
  LevelUp: number;
  Downgrade: number;
  Switch: number;
  Stop: number;
  Attended: number;
}

/** How a metric's score curve behaves. */
export type MetricMode = "standard" | "growth" | "lower";

/** Display formatting hint. */
export type MetricType = "number" | "percent";

/** A configurable metric definition (weight/min/max/enabled), persisted in config. */
export interface MetricConfig {
  id: string;
  name: string;
  min: number;
  max: number;
  /** Weight as a fraction (0..1), e.g. 0.4 = 40%. */
  w: number;
  type: MetricType;
  /** Whether this metric participates in scoring. */
  enabled: boolean;
}

/** One row of a computed score breakdown. */
export interface BreakdownItem {
  id: string;
  name: string;
  type: MetricType;
  min: number;
  max: number;
  w: number;
  /** Value used in the score calculation (already normalized). */
  raw: number;
  /** Human-readable value, e.g. "85.00%" or "152.00". */
  displayValue: string;
  /** The metric's score multiplier (typically 0.5..1.5). */
  score: number;
}

export interface ScoreResult {
  totalScore: number;
  breakdown: BreakdownItem[];
}

export interface Grade {
  grade: "S" | "A" | "B" | "C";
  className: string;
}

/** Center -> target student count. */
export type CenterTargets = Record<string, number>;

/** Grade thresholds (lower bounds), configurable. */
export interface GradeThresholds {
  S: number;
  A: number;
  B: number;
}

/** The full app configuration, persisted in the DB (singleton). */
export interface AppConfig {
  personalKpi: MetricConfig[];
  centerKpi: MetricConfig[];
  centerTargets: CenterTargets;
  gradeThresholds: GradeThresholds;
  /** Account-classification rules for the CSV name pass (whitelists). */
  classify: ClassifyConfig;
}
