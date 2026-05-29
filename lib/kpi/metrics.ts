import type { AggData, MetricConfig, MetricMode, MetricType } from "./types";

/** Context available to metric extractors (values not derivable from CSV aggregates). */
export interface MetricContext {
  /** Management assessment rating, normalized to a 0..100 scale. */
  mgmtRating: number;
}

/** Definition of a known metric: how to read its raw value + how it scores. */
export interface MetricDef {
  id: string;
  name: string;
  type: MetricType;
  mode: MetricMode;
  defaultMin: number;
  defaultMax: number;
  /** Compute the raw metric value from aggregated data + context. */
  extract: (agg: AggData, ctx: MetricContext) => number;
  /** Short helper text for the Settings UI. */
  description?: string;
}

/**
 * The library of all metrics the engine understands. Adding/removing metrics
 * ("指标项目增减") is done by enabling/disabling entries from this library in the
 * active config. The six defaults reproduce KPI_Calculator_v11.1 exactly.
 */
export const METRIC_LIBRARY: Record<string, MetricDef> = {
  student_number: {
    id: "student_number",
    name: "Student Number",
    type: "number",
    mode: "growth",
    defaultMin: 140,
    defaultMax: 280,
    extract: (a) => a.TotalStudent,
    description: "Total students taught (growth curve).",
  },
  upgrade_rate: {
    id: "upgrade_rate",
    name: "Upgrade Rate",
    type: "percent",
    mode: "standard",
    defaultMin: 0.2,
    defaultMax: 0.4,
    extract: (a) => (a.TotalColor ? a.LevelUp / a.TotalColor : 0),
    description: "Level-ups ÷ total color-belt students.",
  },
  progress_rate: {
    id: "progress_rate",
    name: "Progress Rate",
    type: "percent",
    mode: "standard",
    defaultMin: 0.7,
    defaultMax: 0.9,
    extract: (a) => (a.TotalColor ? 1 - a.Black / a.TotalColor : 0),
    description: "1 − (black-cap students ÷ total color students).",
  },
  efficiency_ratio: {
    id: "efficiency_ratio",
    name: "Efficiency Ratio",
    type: "number",
    mode: "standard",
    defaultMin: 3.0,
    defaultMax: 5.0,
    extract: (a) => (a.TotalStudent ? a.Attended / a.TotalStudent : 0),
    description: "Classes attended ÷ total students.",
  },
  retention_rate: {
    id: "retention_rate",
    name: "Retention Rate",
    type: "percent",
    mode: "standard",
    defaultMin: 0.97,
    defaultMax: 0.99,
    extract: (a) => (a.TotalStudent ? 1 - a.Stop / a.TotalStudent : 0),
    description: "1 − (stopped students ÷ total students).",
  },
  management_assessment: {
    id: "management_assessment",
    name: "Mgmt Assessment",
    type: "percent",
    mode: "standard",
    defaultMin: 70,
    defaultMax: 90,
    extract: (_a, ctx) => ctx.mgmtRating,
    description: "Manual management rating (per coach).",
  },
  // --- Optional extras (disabled by default; opt-in via Settings) ---
  net_progression: {
    id: "net_progression",
    name: "Net Progression",
    type: "percent",
    mode: "standard",
    defaultMin: 0.15,
    defaultMax: 0.35,
    extract: (a) => (a.TotalColor ? (a.LevelUp - a.Downgrade) / a.TotalColor : 0),
    description: "(Level-ups − downgrades) ÷ total color students.",
  },
  downgrade_rate: {
    id: "downgrade_rate",
    name: "Downgrade Rate",
    type: "percent",
    mode: "lower",
    defaultMin: 0.0,
    defaultMax: 0.1,
    extract: (a) => (a.TotalColor ? a.Downgrade / a.TotalColor : 0),
    description: "Downgrades ÷ total color students (lower is better).",
  },
};

function makeMetric(id: string, w: number): MetricConfig {
  const def = METRIC_LIBRARY[id];
  return {
    id: def.id,
    name: def.name,
    min: def.defaultMin,
    max: def.defaultMax,
    w,
    type: def.type,
    enabled: true,
  };
}

/** Personal KPI defaults — identical weights to v11.1 (40/12/12/12/12/12). */
export const DEFAULT_PERSONAL_KPI: MetricConfig[] = [
  makeMetric("student_number", 0.4),
  makeMetric("upgrade_rate", 0.12),
  makeMetric("progress_rate", 0.12),
  makeMetric("efficiency_ratio", 0.12),
  makeMetric("retention_rate", 0.12),
  makeMetric("management_assessment", 0.12),
];

/** Center KPI defaults — identical to v11.1 (40/15/15/15/15, no mgmt assessment). */
export const DEFAULT_CENTER_KPI: MetricConfig[] = [
  makeMetric("student_number", 0.4),
  makeMetric("upgrade_rate", 0.15),
  makeMetric("progress_rate", 0.15),
  makeMetric("efficiency_ratio", 0.15),
  makeMetric("retention_rate", 0.15),
];

/** Center student targets — identical to v11.1. */
export const DEFAULT_CENTER_TARGETS: Record<string, number> = {
  HQ: 450,
  Berkeley: 450,
  "Bukit Tinggi": 640,
  Kemuning: 550,
  "Puchong Kinrara": 750,
  "Subang USJ": 750,
  PJ: 600,
  QSM: 500,
};

export const DEFAULT_GRADE_THRESHOLDS = { S: 1.25, A: 1.0, B: 0.75 };
