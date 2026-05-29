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
import type { AppConfig, InstructorRow } from "@/lib/kpi/types";
import type { Position, RunCoach } from "@/lib/types";

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

export type CoachRecord = typeof coaches.$inferSelect;
export type RunRecord = typeof runs.$inferSelect;
export type ConfigRecord = typeof config.$inferSelect;
