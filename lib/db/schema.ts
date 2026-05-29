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
  coachId: integer("coach_id"),
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

export type AuditLogRecord = typeof auditLog.$inferSelect;
export type UserRecord = typeof users.$inferSelect;
export type PermissionConfigRecord = typeof permissionConfig.$inferSelect;
export type PerformanceConfigRecord = typeof performanceConfig.$inferSelect;
export type AppraisalRecord = typeof appraisals.$inferSelect;
export type NoteRecord = typeof notes.$inferSelect;
export type CoachRecord = typeof coaches.$inferSelect;
export type RunRecord = typeof runs.$inferSelect;
export type ConfigRecord = typeof config.$inferSelect;
export type AllowanceConfigRecord = typeof allowanceConfig.$inferSelect;
export type AllowanceRunRecord = typeof allowanceRuns.$inferSelect;
