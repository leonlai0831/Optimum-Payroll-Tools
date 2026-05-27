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
import type { Role } from "@/lib/auth/types";
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
  defaultPosition: text("default_position").$type<Position>().default("Instructor").notNull(),
  lastMgmtAssessment: real("last_mgmt_assessment"),
  lastMgmtAssessmentAt: timestamp("last_mgmt_assessment_at", { withTimezone: true }),
  lastAllowance: real("last_allowance"),
  allowanceTier: text("allowance_tier").$type<AllowanceTier>(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export type UserRecord = typeof users.$inferSelect;
export type CoachRecord = typeof coaches.$inferSelect;
export type RunRecord = typeof runs.$inferSelect;
export type ConfigRecord = typeof config.$inferSelect;
export type AllowanceConfigRecord = typeof allowanceConfig.$inferSelect;
export type AllowanceRunRecord = typeof allowanceRuns.$inferSelect;
