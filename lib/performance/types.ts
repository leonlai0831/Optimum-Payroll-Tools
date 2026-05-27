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
