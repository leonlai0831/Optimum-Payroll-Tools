/** Account-level permission roles. Extensible — add e.g. "supervisor" here later. */
export const ROLES = ["super_admin", "admin", "supervisor", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
  staff: "Staff",
};

/**
 * Role seniority for hierarchy-scoped user management. A `manage_users` holder
 * may MANAGE only accounts ranked strictly below their own role, sees accounts
 * of their OWN rank read-only, and never sees higher-ranked accounts at all
 * (lists filter them out; direct API access 404s so existence doesn't leak).
 * super_admin is the one exception: all-access by definition, including over
 * fellow super_admins (the last-active-super-admin safeguards in the user API
 * keep that safe).
 */
export const ROLE_RANK: Record<Role, number> = {
  super_admin: 3,
  admin: 2,
  supervisor: 1,
  staff: 0,
};

/** May `actor` see accounts of role `target`? Strictly higher ranks are hidden. */
export function canViewUserRole(actor: Role, target: Role): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK[target];
}

/**
 * May `actor` manage (create / edit / delete / assign) accounts of role
 * `target`? Same rank is view-only — except super_admin, which manages peers.
 */
export function canManageUserRole(actor: Role, target: Role): boolean {
  return actor === "super_admin" || ROLE_RANK[actor] > ROLE_RANK[target];
}

/**
 * Granular capabilities checked across the app. Staff and settings access is
 * brand-scoped (`swim_*` / `fit_*`) so e.g. a gym manager can hold the Optimum
 * Fit staff directory without also seeing the whole swim directory.
 */
export const CAPABILITIES = [
  "manage_users",
  "swim_view_settings",
  "swim_edit_settings",
  "fit_view_settings",
  "fit_edit_settings",
  "swim_view_staff",
  "swim_edit_staff",
  "fit_view_staff",
  "fit_edit_staff",
  "view_own",
  "edit_appraisals",
  "edit_notes",
  "run_kpi",
  "finalize_kpi",
  "run_allowance",
  "run_freelancer",
  "run_commission",
  "view_audit",
  "edit_lesson_plans",
  "review_lesson_plans",
  "submit_timesheet",
  "review_timesheet",
  "manage_freelancer_schedule",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  manage_users: "Manage user accounts",
  swim_view_settings: "View swim settings",
  swim_edit_settings: "Edit swim settings",
  fit_view_settings: "View fit settings",
  fit_edit_settings: "Edit fit settings",
  swim_view_staff: "View all swim staff",
  swim_edit_staff: "Edit swim staff profiles",
  fit_view_staff: "View all gym staff",
  fit_edit_staff: "Edit gym staff profiles",
  view_own: "View own profile",
  edit_appraisals: "Create instructor assessments",
  edit_notes: "Create/edit notes",
  run_kpi: "Run KPI bonus",
  finalize_kpi: "Finalize KPI bonus (management review)",
  run_allowance: "Run allowance",
  run_freelancer: "Run freelancer payments",
  run_commission: "Run gym staff commission",
  view_audit: "View audit log",
  edit_lesson_plans: "Create & edit lesson plans",
  review_lesson_plans: "Review lesson plans",
  submit_timesheet: "Submit own timesheet (clock-in)",
  review_timesheet: "Review & approve timesheets",
  manage_freelancer_schedule: "Maintain freelancer fixed schedules",
};

/**
 * Retired cross-brand capabilities → their brand-scoped replacements. A stored
 * matrix that granted a legacy key grants BOTH new keys, so the split changes
 * nothing about a deployment's effective access until the owner edits the
 * matrix. Applied on read by `normalizePermissionConfig` (lib/db/queries.ts),
 * which also drops the legacy keys.
 */
export const LEGACY_CAPABILITY_MAP: Record<string, Capability[]> = {
  view_all_staff: ["swim_view_staff", "fit_view_staff"],
  edit_staff: ["swim_edit_staff", "fit_edit_staff"],
  view_settings: ["swim_view_settings", "fit_view_settings"],
  edit_settings: ["swim_edit_settings", "fit_edit_settings"],
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

/** Every assignable category (super_admin's effective list; legacy backfills). */
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

/**
 * The editable permission matrix (super_admin omitted — it can never be locked
 * out): per-role capabilities + per-role default launcher categories. A user's
 * effective visibility = their `visibleCategories` override when set, else
 * `categories[role]` (see {@link effectiveCategories}). Rows stored before
 * `categories` existed were the flat `Record<ConfigurableRole, Capability[]>`
 * shape — `normalizePermissionConfig` (lib/db/queries.ts) migrates on read.
 */
export interface PermissionConfig {
  capabilities: Record<ConfigurableRole, Capability[]>;
  categories: Record<ConfigurableRole, ToolCategory[]>;
}

/**
 * The pre-`categories` stored shape, still accepted on read. `string[]` (not
 * `Capability[]`) because stored rows of either shape may also carry the retired
 * cross-brand keys (see {@link LEGACY_CAPABILITY_MAP}).
 */
export type LegacyPermissionConfig = Record<ConfigurableRole, string[]>;

/**
 * Resolve the launcher categories an account effectively sees:
 * per-user override (when set) ?? the role's default; super_admin always all.
 * Pure so the rule is unit-testable — `getCurrentUser()` is the ONE place that
 * applies it (into `CurrentUser.visibleCategories`); everything downstream
 * (launcher, `canSeeCategory`, brand layouts) consumes the resolved list.
 */
export function effectiveCategories(
  role: Role,
  override: ToolCategory[] | null | undefined,
  roleDefaults: PermissionConfig["categories"],
): ToolCategory[] {
  if (role === "super_admin") return [...TOOL_CATEGORIES];
  return [...(override ?? roleDefaults[role] ?? [])];
}

const DEFAULT_CAPABILITIES: Record<ConfigurableRole, Capability[]> = {
  // The brand-scoped pairs mirror the pre-split defaults: a role that held the
  // legacy cross-brand key holds BOTH scoped keys.
  admin: [
    "swim_view_settings",
    "fit_view_settings",
    "swim_edit_staff",
    "fit_edit_staff",
    "swim_view_staff",
    "fit_view_staff",
    "view_own",
    "edit_appraisals",
    "edit_notes",
    "run_kpi",
    // Finalize a KPI month after the management review — admin + super_admin only.
    "finalize_kpi",
    "run_allowance",
    "run_freelancer",
    "run_commission",
    "view_audit",
    "edit_lesson_plans",
    "review_lesson_plans",
    "submit_timesheet",
    "review_timesheet",
    "manage_freelancer_schedule",
  ],
  // A team lead / senior coach: oversee and review the team, run the monthly
  // numbers, but no profile edits, user management, settings edits, or audit log.
  // Deliberately NOT granted `finalize_kpi` (closing a month is admin-only).
  supervisor: [
    "swim_view_settings",
    "fit_view_settings",
    "swim_view_staff",
    "fit_view_staff",
    "view_own",
    "edit_appraisals",
    "edit_notes",
    "run_kpi",
    "run_allowance",
    "run_freelancer",
    "run_commission",
    "edit_lesson_plans",
    "review_lesson_plans",
    "submit_timesheet",
    "review_timesheet",
    "manage_freelancer_schedule",
  ],
  staff: ["view_own", "edit_lesson_plans", "submit_timesheet"],
};

export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  capabilities: DEFAULT_CAPABILITIES,
  // Role defaults for launcher visibility. All three per role preserves the
  // pre-unification behavior (every account saw everything unless a per-user
  // override narrowed it) until the owner tightens these in /system/permissions.
  categories: {
    admin: [...TOOL_CATEGORIES],
    supervisor: [...TOOL_CATEGORIES],
    staff: [...TOOL_CATEGORIES],
  },
};
