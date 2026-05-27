// Domain types for the employee performance / HR features. Independent of the
// KPI scoring engine — these describe people (job role, employment type) and,
// later, their appraisals and notes.

/** Employee job role (distinct from the KPI `Position` and the account permission role). */
export const EMPLOYEE_ROLES = ["instructor", "front_desk"] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];
export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRole, string> = {
  instructor: "Instructor",
  front_desk: "Front Desk",
};

export const EMPLOYMENT_TYPES = ["full_time", "freelancer"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  freelancer: "Freelancer",
};

/** A configurable appraisal dimension (e.g. "Teaching Quality"). */
export interface AppraisalDimension {
  key: string;
  label: string;
}

/** One dimension's score on an appraisal, snapshotted so history survives config edits. */
export interface AppraisalRating {
  key: string;
  label: string;
  score: number; // 1–5
}

/** Editable appraisal configuration, persisted as a singleton. */
export interface PerformanceConfig {
  dimensions: AppraisalDimension[];
}

/** Kinds of free-form HR notes kept against an employee. */
export const NOTE_TYPES = ["recognition", "disciplinary", "coaching", "general"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];
export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  recognition: "Recognition",
  disciplinary: "Disciplinary",
  coaching: "Coaching",
  general: "General",
};

export const NOTE_SEVERITIES = ["low", "medium", "high"] as const;
export type NoteSeverity = (typeof NOTE_SEVERITIES)[number];
export const NOTE_SEVERITY_LABELS: Record<NoteSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** Overall 0–100 score from the mean of 1–5 dimension ratings. */
export function overallFromRatings(ratings: AppraisalRating[]): number {
  if (ratings.length === 0) return 0;
  const mean = ratings.reduce((s, r) => s + r.score, 0) / ratings.length;
  return Math.round((mean / RATING_MAX) * 100);
}
