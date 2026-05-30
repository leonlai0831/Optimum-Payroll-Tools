/** Account-level permission roles. Extensible — add e.g. "supervisor" here later. */
export const ROLES = ["super_admin", "admin", "supervisor", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
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
  "view_audit",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  manage_users: "Manage user accounts",
  edit_settings: "Edit settings",
  view_settings: "View settings",
  edit_staff: "Edit staff profiles",
  view_all_staff: "View all staff",
  view_own: "View own profile",
  edit_appraisals: "Create/edit appraisals",
  edit_notes: "Create/edit notes",
  run_kpi: "Run KPI bonus",
  run_allowance: "Run allowance",
  view_audit: "View audit log",
};

/** Roles whose capabilities are configurable (super_admin is always all-access). */
export type ConfigurableRole = Exclude<Role, "super_admin">;
export const CONFIGURABLE_ROLES: ConfigurableRole[] = ["admin", "supervisor", "staff"];

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
    "view_audit",
  ],
  // A team lead / senior coach: oversee and review the team, run the monthly
  // numbers, but no profile edits, user management, settings edits, or audit log.
  supervisor: [
    "view_settings",
    "view_all_staff",
    "view_own",
    "edit_appraisals",
    "edit_notes",
    "run_kpi",
    "run_allowance",
  ],
  staff: ["view_own"],
};
