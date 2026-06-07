import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { PermissionConfig, Role } from "@/lib/auth/types";
import type {
  AppraisalRating,
  EmployeeRole,
  EmploymentType,
  NoteSeverity,
  NoteType,
  PerformanceConfig,
} from "@/lib/performance/types";
import type { AppConfig, InstructorRow } from "@/lib/kpi/types";
import type { GradeKey, RatingMap } from "@/lib/assessment/types";
import type { CommissionConfig, CommissionRow, CommissionSummary } from "@/lib/commission/types";
import type { TeachingConfig, TeachingRow, TeachingSummary } from "@/lib/teaching/types";
import type { GymEmploymentType, GymPosition } from "@/lib/gym/types";
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
});

/** Singleton role→capability matrix (one row, id = 1). super_admin is not stored. */
export const permissionConfig = pgTable("permission_config", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").$type<PermissionConfig>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Per-user login accounts. Email is the account name (stored lowercased). */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().default("staff").notNull(),
  // Optional link to the employee record this login belongs to (no FK, matches allowanceRuns).
  // A login belongs to at most one employee: a Swim coach (`coachId`) OR an Optimum Fit
  // gym-staff member (`gymStaffId`) — the two are mutually exclusive, enforced at the API.
  coachId: integer("coach_id"),
  gymStaffId: integer("gym_staff_id"),
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
});

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
});

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
});

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
});

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
});

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

/** Singleton appraisal configuration (one row, id = 1). */
export const performanceConfig = pgTable("performance_config", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").$type<PerformanceConfig>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** A performance appraisal for one employee. Ratings are snapshotted. */
export const appraisals = pgTable("appraisals", {
  id: serial("id").primaryKey(),
  coachId: integer("coach_id").notNull(),
  periodLabel: text("period_label").default("").notNull(),
  reviewDate: timestamp("review_date", { withTimezone: true }).defaultNow().notNull(),
  reviewedBy: text("reviewed_by").default("").notNull(),
  ratings: jsonb("ratings").$type<AppraisalRating[]>().notNull().default([]),
  overallScore: real("overall_score").notNull(),
  comments: text("comments").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * An instructor assessment (observation form). The per-criterion `ratings` and
 * the computed `totalPercent` / `finalGrade` are snapshotted so history survives
 * later form changes; the latest `totalPercent` per coach feeds the KPI
 * management assessment. The successor to `appraisals`.
 */
export const assessments = pgTable("assessments", {
  id: serial("id").primaryKey(),
  coachId: integer("coach_id").notNull(),
  observedOn: timestamp("observed_on", { withTimezone: true }).defaultNow().notNull(),
  assessor: text("assessor").default("").notNull(),
  classType: text("class_type").default("").notNull(),
  poolType: text("pool_type").default("").notNull(),
  pax: integer("pax"),
  ratings: jsonb("ratings").$type<RatingMap>().notNull().default({}),
  totalPercent: real("total_percent").notNull(),
  finalGrade: text("final_grade").$type<GradeKey>().notNull(),
  comments: text("comments").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
});

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
export type PerformanceConfigRecord = typeof performanceConfig.$inferSelect;
export type AppraisalRecord = typeof appraisals.$inferSelect;
export type AssessmentRecord = typeof assessments.$inferSelect;
export type NoteRecord = typeof notes.$inferSelect;
export type CoachRecord = typeof coaches.$inferSelect;
export type RunRecord = typeof runs.$inferSelect;
export type ConfigRecord = typeof config.$inferSelect;
export type AllowanceConfigRecord = typeof allowanceConfig.$inferSelect;
export type AllowanceRunRecord = typeof allowanceRuns.$inferSelect;
export type CommissionConfigRecord = typeof commissionConfig.$inferSelect;
export type CommissionRunRecord = typeof commissionRuns.$inferSelect;
export type TeachingConfigRecord = typeof teachingConfig.$inferSelect;
export type TeachingRunRecord = typeof teachingRuns.$inferSelect;
export type GymStaffRecord = typeof gymStaff.$inferSelect;
export type GymNoteRecord = typeof gymNotes.$inferSelect;
