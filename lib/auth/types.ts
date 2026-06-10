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
  "finalize_kpi",
  "run_allowance",
  "run_commission",
  "view_audit",
  "edit_lesson_plans",
  "review_lesson_plans",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  manage_users: "Manage user accounts",
  edit_settings: "Edit settings",
  view_settings: "View settings",
  edit_staff: "Edit staff profiles",
  view_all_staff: "View all staff",
  view_own: "View own profile",
  edit_appraisals: "Create instructor assessments",
  edit_notes: "Create/edit notes",
  run_kpi: "Run KPI bonus",
  finalize_kpi: "Finalize KPI bonus (management review)",
  run_allowance: "Run allowance",
  run_commission: "Run gym staff commission",
  view_audit: "View audit log",
  edit_lesson_plans: "Create & edit lesson plans",
  review_lesson_plans: "Review lesson plans",
};

/**
 * Launcher categories a user can be granted. These mirror the home-launcher
 * brand groups (minus "system", which is super_admin-only by nature, and so
 * never assignable). super_admin always sees every category.
 */
export const TOOL_CATEGORIES = ["swim", "fit", "marketing"] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export const TOOL_CATEGORY_LABELS: Record<ToolCategory, string> = {
  swim: "Optimum Swim School",
  fit: "Optimum Fit",
  marketing: "Optimum Marketing",
};

/** Default for new (and pre-existing) accounts: everything visible. */
export const ALL_TOOL_CATEGORIES: ToolCategory[] = [...TOOL_CATEGORIES];

/** Validate + dedupe an untrusted category list, preserving canonical order. */
export function sanitizeToolCategories(input: unknown): ToolCategory[] | null {
  if (!Array.isArray(input)) return null;
  if (!input.every((v) => (TOOL_CATEGORIES as readonly string[]).includes(v as string))) {
    return null;
  }
  return TOOL_CATEGORIES.filter((c) => (input as string[]).includes(c));
}

/**
 * Whether an account may see a launcher category. super_admin always does.
 * Used by both the home launcher (hide cards) and the brand-section layouts
 * (block direct navigation) so the two can't drift.
 */
export function canSeeCategory(
  user: { role: Role; visibleCategories: ToolCategory[] },
  category: ToolCategory,
): boolean {
  return user.role === "super_admin" || user.visibleCategories.includes(category);
}

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
    // Finalize a KPI month after the management review — admin + super_admin only.
    "finalize_kpi",
    "run_allowance",
    "run_commission",
    "view_audit",
    "edit_lesson_plans",
    "review_lesson_plans",
  ],
  // A team lead / senior coach: oversee and review the team, run the monthly
  // numbers, but no profile edits, user management, settings edits, or audit log.
  // Deliberately NOT granted `finalize_kpi` (closing a month is admin-only).
  supervisor: [
    "view_settings",
    "view_all_staff",
    "view_own",
    "edit_appraisals",
    "edit_notes",
    "run_kpi",
    "run_allowance",
    "run_commission",
    "edit_lesson_plans",
    "review_lesson_plans",
  ],
  staff: ["view_own", "edit_lesson_plans"],
};
