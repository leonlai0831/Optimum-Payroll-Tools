// Domain types for the employee performance / HR features. Independent of the
// KPI scoring engine — these describe people (job role, employment type) and
// their notes.

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

