import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  LegacyPermissionConfig,
  PermissionConfig,
  Role,
  ToolCategory,
} from "@/lib/auth/types";
import type {
  EmployeeRole,
  EmploymentType,
  NoteSeverity,
  NoteType,
} from "@/lib/performance/types";
import type { AppConfig, InstructorRow } from "@/lib/kpi/types";
import type { GradeKey, RatingMap } from "@/lib/assessment/types";
import type { CommissionConfig, CommissionRow, CommissionSummary } from "@/lib/commission/types";
import type { TeachingConfig, TeachingRow, TeachingSummary } from "@/lib/teaching/types";
import type { GymEmploymentType, GymPosition } from "@/lib/gym/types";
import type { LessonPlanData, LessonPlanStatus, LessonPlanType, LevelType } from "@/lib/lesson-plan/types";
import type { Position, RunCoach } from "@/lib/types";
import type {
  AllowanceConfig,
  AllowanceInput,
  AllowanceResult,
  AllowanceTier,
} from "@/lib/allowance/types";

/** Singleton active configuration (one row, id = 1). */
export const config = pgTable("config", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").$type<AppConfig>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Coach profiles: stable identity + cross-month memory. */
export const coaches = pgTable("coaches", {
  id: serial("id").primaryKey(),
  canonicalName: text("canonical_name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  center: text("center").default("").notNull(),
  // Employee job role (instructor / front_desk) — distinct from the KPI position below.
  jobRole: text("job_role").$type<EmployeeRole>().default("instructor").notNull(),
  employmentType: text("employment_type").$type<EmploymentType>().default("full_time").notNull(),
  defaultPosition: text("default_position").$type<Position>().default("Instructor").notNull(),
  lastMgmtAssessment: real("last_mgmt_assessment"),
  lastMgmtAssessmentAt: timestamp("last_mgmt_assessment_at", { withTimezone: true }),
  lastAllowance: real("last_allowance"),
  allowanceTier: text("allowance_tier").$type<AllowanceTier>(),
  // KPI link override: user marked this coach "not applicable" for KPI linking.
  // `kpiLinkNaTier` snapshots the tier when set, so the panel can re-surface the
  // coach if they later move up to a teaching tier.
  kpiLinkNa: boolean("kpi_link_na").default(false).notNull(),
  kpiLinkNaTier: text("kpi_link_na_tier").$type<AllowanceTier>(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  // One profile per canonical name: the merge pass + carry-over upserts all key
  // coaches by canonical name, so a duplicate would silently split a person's
  // history. UNIQUE makes that a hard guarantee (dedup runs first in the migration).
}, (t) => [uniqueIndex("coaches_name_idx").on(t.canonicalName)]);

/**
 * Singleton role permission matrix (one row, id = 1). super_admin is not stored.
 * `data` = { capabilities, categories } (PermissionConfig); rows written before
 * `categories` existed hold the flat capability map and are migrated on read by
 * `normalizePermissionConfig`, so the stored type is the union of both shapes.
 */
export const permissionConfig = pgTable("permission_config", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").$type<PermissionConfig | LegacyPermissionConfig>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Per-user login accounts. Email is the account name (stored lowercased). */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  // Friendly name shown as the submitter/editor across the app (assessments,
  // allowance + KPI history). Empty falls back to the email.
  displayName: text("display_name").default("").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().default("staff").notNull(),
  // Optional link to the employee record this login belongs to (no FK, matches allowanceRuns).
  // A login belongs to at most one employee: a Swim coach (`coachId`) OR an Optimum Fit
  // gym-staff member (`gymStaffId`) — the two are mutually exclusive, enforced at the API.
  coachId: integer("coach_id"),
  gymStaffId: integer("gym_staff_id"),
  // Per-user launcher-category OVERRIDE (System Setting → Permissions → User
  // overrides). NULL = inherit the role's default categories from the
  // permission matrix; a non-null array pins this account to exactly that list.
  // super_admin ignores this and always sees everything.
  visibleCategories: jsonb("visible_categories").$type<ToolCategory[] | null>(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** A saved monthly run (history record). */
export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  periodLabel: text("period_label").notNull(),
  filename: text("filename").default("").notNull(),
  status: text("status").$type<"draft" | "finalized">().default("finalized").notNull(),
  csvRows: jsonb("csv_rows").$type<InstructorRow[]>().notNull(),
  configSnapshot: jsonb("config_snapshot").$type<AppConfig>().notNull(),
  coachResults: jsonb("coach_results").$type<RunCoach[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("runs_created_idx").on(t.createdAt)]);

/**
 * A staged KPI data delivery pushed by the external system (POST /api/ingest/kpi).
 * `rows` is already normalized to canonical InstructorRow[] at receive time, so
 * the owner can review/edit it and load it into the calculator exactly like an
 * uploaded CSV. Rows are NEVER hard-deleted: "discarded" is a status, and an
 * imported delivery keeps its rows viewable forever (with `importedRunId`
 * pointing at the saved run it became).
 */
export const kpiIngests = pgTable("kpi_ingests", {
  id: serial("id").primaryKey(),
  periodLabel: text("period_label").notNull(),
  /** Source filename / free-form note supplied by the sender. */
  label: text("label").default("").notNull(),
  rows: jsonb("rows").$type<InstructorRow[]>().notNull(),
  status: text("status")
    .$type<"pending" | "imported" | "discarded">()
    .default("pending")
    .notNull(),
  importedRunId: integer("imported_run_id"),
  importedAt: timestamp("imported_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // The dashboard's "Pending uploads" card filters by status; the list orders by receivedAt.
  index("kpi_ingests_status_idx").on(t.status),
  index("kpi_ingests_received_idx").on(t.receivedAt),
]);

/** Singleton allowance rate tables (one row, id = 1). */
export const allowanceConfig = pgTable("allowance_config", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").$type<AllowanceConfig>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** A saved full-time allowance calculation for one coach in one month. */
export const allowanceRuns = pgTable("allowance_runs", {
  id: serial("id").primaryKey(),
  periodLabel: text("period_label").notNull(),
  coachId: integer("coach_id"),
  canonicalName: text("canonical_name").notNull(),
  tier: text("tier").$type<AllowanceTier>().notNull(),
  center: text("center").default("").notNull(),
  input: jsonb("input").$type<AllowanceInput>().notNull(),
  result: jsonb("result").$type<AllowanceResult>().notNull(),
  configSnapshot: jsonb("config_snapshot").$type<AllowanceConfig>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // One allowance record per (period, coach). UNIQUE lets createAllowanceRun do a
  // single atomic onConflictDoUpdate upsert (the dedup runs first in the
  // migration). Its leading `period_label` column also serves the period-only
  // lookups, so the separate `allowance_runs_period_idx` was dropped as redundant.
  uniqueIndex("allowance_runs_period_name_idx").on(t.periodLabel, t.canonicalName),
  index("allowance_runs_coach_idx").on(t.coachId),
]);

/** Singleton Optimum Fit commission rate bands (one row, id = 1). */
export const commissionConfig = pgTable("commission_config", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").$type<CommissionConfig>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A saved Optimum Fit commission month. `salesRows` is the consolidated Tab-1
 * data (so the workbook can be re-exported and History rendered without the
 * source files); `summary` is the computed Tab-2 result; `configSnapshot` makes
 * the month reproducible after later rate-band edits.
 */
export const commissionRuns = pgTable("commission_runs", {
  id: serial("id").primaryKey(),
  periodLabel: text("period_label").notNull(),
  filename: text("filename").default("").notNull(),
  salesRows: jsonb("sales_rows").$type<CommissionRow[]>().notNull(),
  configSnapshot: jsonb("config_snapshot").$type<CommissionConfig>().notNull(),
  summary: jsonb("summary").$type<CommissionSummary>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("commission_runs_period_idx").on(t.periodLabel)]);

/** Singleton Optimum Fit coaching-income rates (one row, id = 1). */
export const teachingConfig = pgTable("teaching_config", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").$type<TeachingConfig>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A saved Optimum Fit coaching-income month. Mirrors `commissionRuns`:
 * `sessionRows` is the parsed class-attendees data (so History/Excel re-render
 * without the source file); `summary` is the computed per-coach result;
 * `configSnapshot` makes the month reproducible after later rate edits.
 */
export const teachingRuns = pgTable("teaching_runs", {
  id: serial("id").primaryKey(),
  periodLabel: text("period_label").notNull(),
  filename: text("filename").default("").notNull(),
  sessionRows: jsonb("session_rows").$type<TeachingRow[]>().notNull(),
  configSnapshot: jsonb("config_snapshot").$type<TeachingConfig>().notNull(),
  summary: jsonb("summary").$type<TeachingSummary>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("teaching_runs_period_idx").on(t.periodLabel)]);

/**
 * Optimum Fit gym-staff roster: position (sales consultant / personal trainer /
 * front desk) + employment type (incl. freelancer). Separate from swim `coaches`.
 * `staffCode` links to commission data; `aliases` help match coaching exports.
 */
export const gymStaff = pgTable("gym_staff", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  staffCode: text("staff_code").default("").notNull(),
  position: text("position").$type<GymPosition>().default("personal_trainer").notNull(),
  employmentType: text("employment_type").$type<GymEmploymentType>().default("full_time").notNull(),
  email: text("email").default("").notNull(),
  phone: text("phone").default("").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("gym_staff_name_idx").on(t.name)]);

/** A free-form HR note on a gym-staff member — the Optimum Fit parallel of `notes`. */
export const gymNotes = pgTable("gym_notes", {
  id: serial("id").primaryKey(),
  gymStaffId: integer("gym_staff_id").notNull(),
  noteDate: timestamp("note_date", { withTimezone: true }).defaultNow().notNull(),
  type: text("type").$type<NoteType>().default("general").notNull(),
  title: text("title").default("").notNull(),
  body: text("body").default("").notNull(),
  severity: text("severity").$type<NoteSeverity>(),
  followUp: boolean("follow_up").default(false).notNull(),
  authoredBy: text("authored_by").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * An instructor assessment (observation form). The per-criterion `ratings` and
 * the computed `totalPercent` / `finalGrade` are snapshotted so history survives
 * later form changes; the latest `totalPercent` per coach feeds the KPI
 * management assessment.
 */
export const assessments = pgTable("assessments", {
  id: serial("id").primaryKey(),
  coachId: integer("coach_id").notNull(),
  observedOn: timestamp("observed_on", { withTimezone: true }).defaultNow().notNull(),
  assessor: text("assessor").default("").notNull(),
  classType: text("class_type").default("").notNull(),
  poolType: text("pool_type").default("").notNull(),
  pax: integer("pax"),
  levels: jsonb("levels").$type<string[]>().notNull().default([]),
  hasHelper: boolean("has_helper").default(false).notNull(),
  ratings: jsonb("ratings").$type<RatingMap>().notNull().default({}),
  totalPercent: real("total_percent").notNull(),
  finalGrade: text("final_grade").$type<GradeKey>().notNull(),
  comments: text("comments").default("").notNull(),
  // Optional link to the lesson plan of the class being observed. No DB-level
  // FK (repo convention) — the API validates plan.coachId === coachId on save.
  lessonPlanId: integer("lesson_plan_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("assessments_coach_idx").on(t.coachId),
  // Supports the "latest assessment per coach" lookup (filter coach_id, order observed_on).
  index("assessments_coach_observed_idx").on(t.coachId, t.observedOn),
]);

/**
 * A digital lesson plan (actual or replacement class) with a lightweight review
 * workflow: draft → submitted → approved / changes_requested. Any content edit
 * resets the status to draft (the last `reviewNote` is kept visible). The full
 * form body lives in `data` (jsonb); the promoted columns power the History
 * list without loading the body.
 */
export const lessonPlans = pgTable("lesson_plans", {
  id: serial("id").primaryKey(),
  type: text("type").$type<LessonPlanType>().notNull(),
  status: text("status").$type<LessonPlanStatus>().default("draft").notNull(),
  // The login that created the plan (visibility + edit rights are creator-scoped).
  createdByUserId: integer("created_by_user_id").notNull(),
  createdByName: text("created_by_name").default("").notNull(),
  // Optional link to the creator's coach profile (when their login has one).
  coachId: integer("coach_id"),
  // For a replacement plan this is the REPLACEMENT instructor (the person filling).
  instructorName: text("instructor_name").notNull(),
  // Replacement plans only: the actual class instructor being covered.
  actualInstructorName: text("actual_instructor_name").default("").notNull(),
  center: text("center").default("").notNull(),
  lessonDate: timestamp("lesson_date", { withTimezone: true }).notNull(),
  timeLabel: text("time_label").default("").notNull(),
  // Replacement plans only: which skill-checklist set applies (low/medium/high).
  levelType: text("level_type").$type<LevelType>(),
  classLevel: text("class_level").default("").notNull(),
  // Actual plans only.
  ageGroup: text("age_group").default("").notNull(),
  data: jsonb("data").$type<LessonPlanData>().notNull(),
  // When the post-lesson self-evaluation (data.selfEval + data.remarks) was
  // last filled in; null = not filled yet. Set by the self_eval action only —
  // content edits never touch it.
  selfEvalAt: timestamp("self_eval_at", { withTimezone: true }),
  reviewNote: text("review_note").default("").notNull(),
  reviewedByEmail: text("reviewed_by_email").default("").notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Editors see only their own plans — the list filters by creator.
  index("lesson_plans_creator_idx").on(t.createdByUserId),
  index("lesson_plans_status_idx").on(t.status),
  // The History list orders by lesson date.
  index("lesson_plans_date_idx").on(t.lessonDate),
]);

/** A free-form HR note (recognition / disciplinary / coaching / general) on an employee. */
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  coachId: integer("coach_id").notNull(),
  noteDate: timestamp("note_date", { withTimezone: true }).defaultNow().notNull(),
  type: text("type").$type<NoteType>().default("general").notNull(),
  title: text("title").default("").notNull(),
  body: text("body").default("").notNull(),
  severity: text("severity").$type<NoteSeverity>(),
  followUp: boolean("follow_up").default(false).notNull(),
  authoredBy: text("authored_by").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Append-only audit trail of sensitive mutations (who changed what, when).
 * `actorId` is nullable + has no FK so a later account deletion never erases
 * history; `actorEmail` snapshots the actor for display. `entityId` is text so
 * any id (or none) fits.
 */
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  actorEmail: text("actor_email").default("").notNull(),
  action: text("action").notNull(),
  entity: text("entity").default("").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // The "who last did <action> on <entity>" attribution lookup filters by
  // (entity, action) and orders by created_at.
  index("audit_log_entity_action_created_idx").on(t.entity, t.action, t.createdAt),
  // The recent-activity feed orders by created_at desc.
  index("audit_log_created_idx").on(t.createdAt.desc()),
]);

/**
 * A finalized (locked) allowance month. One row per locked `periodLabel`; the
 * row's presence means the month is closed — saves/edits/deletes of that
 * month's allowance records are rejected until it's unlocked (row removed).
 * `lockedBy` snapshots who closed it, for display.
 */
export const allowancePeriodLocks = pgTable("allowance_period_locks", {
  periodLabel: text("period_label").primaryKey(),
  lockedBy: text("locked_by").default("").notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AuditLogRecord = typeof auditLog.$inferSelect;
export type AllowancePeriodLockRecord = typeof allowancePeriodLocks.$inferSelect;
export type UserRecord = typeof users.$inferSelect;
export type PermissionConfigRecord = typeof permissionConfig.$inferSelect;
export type AssessmentRecord = typeof assessments.$inferSelect;
export type NoteRecord = typeof notes.$inferSelect;
export type CoachRecord = typeof coaches.$inferSelect;
export type RunRecord = typeof runs.$inferSelect;
export type KpiIngestRecord = typeof kpiIngests.$inferSelect;
export type ConfigRecord = typeof config.$inferSelect;
export type AllowanceConfigRecord = typeof allowanceConfig.$inferSelect;
export type AllowanceRunRecord = typeof allowanceRuns.$inferSelect;
export type CommissionConfigRecord = typeof commissionConfig.$inferSelect;
export type CommissionRunRecord = typeof commissionRuns.$inferSelect;
export type TeachingConfigRecord = typeof teachingConfig.$inferSelect;
export type TeachingRunRecord = typeof teachingRuns.$inferSelect;
export type GymStaffRecord = typeof gymStaff.$inferSelect;
export type GymNoteRecord = typeof gymNotes.$inferSelect;
export type LessonPlanRecord = typeof lessonPlans.$inferSelect;
