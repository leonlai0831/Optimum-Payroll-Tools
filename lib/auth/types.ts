/** Account-level permission roles. Extensible — add e.g. "supervisor" here later. */
export const ROLES = ["super_admin", "admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
};
