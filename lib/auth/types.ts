/** Account-level permission roles. Extensible — add e.g. "supervisor" here later. */
export const ROLES = ["super_admin", "admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
};

/** Granular capabilities checked across the app. */
export const CAPABILITIES = [
  "manage_users",
  "edit_settings",
  "view_settings",
  "edit_staff",
  "view_all_staff",
  "view_own",
  "edit_appraisals",
  "edit_notes",
  "run_kpi",
  "run_allowance",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Roles whose capabilities are configurable (super_admin is always all-access). */
export type ConfigurableRole = Exclude<Role, "super_admin">;
export const CONFIGURABLE_ROLES: ConfigurableRole[] = ["admin", "staff"];

/** The editable permission matrix (super_admin omitted — it can never be locked out). */
export type PermissionConfig = Record<ConfigurableRole, Capability[]>;

export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  admin: [
    "view_settings",
    "edit_staff",
    "view_all_staff",
    "view_own",
    "edit_appraisals",
    "edit_notes",
    "run_kpi",
    "run_allowance",
  ],
  staff: ["view_own"],
};
