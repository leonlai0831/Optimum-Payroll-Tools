import { cache } from "react";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./index";
import { logger } from "@/lib/log";
import {
  allowanceConfig,
  allowancePeriodLocks,
  allowanceRuns,
  appraisals,
  auditLog,
  coaches,
  config,
  notes,
  performanceConfig,
  permissionConfig,
  runs,
  users,
  type AllowancePeriodLockRecord,
  type AllowanceRunRecord,
  type AppraisalRecord,
  type AuditLogRecord,
  type CoachRecord,
  type NoteRecord,
  type RunRecord,
  type UserRecord,
} from "./schema";
import { hashPassword } from "@/lib/auth/password";
import { CONFIGURABLE_ROLES, DEFAULT_PERMISSION_CONFIG, type PermissionConfig, type Role } from "@/lib/auth/types";
import { DEFAULT_PERFORMANCE_CONFIG } from "@/lib/performance/defaults";
import type {
  AppraisalRating,
  EmployeeRole,
  EmploymentType,
  NoteSeverity,
  NoteType,
  PerformanceConfig,
} from "@/lib/performance/types";
import {
  DEFAULT_CENTER_KPI,
  DEFAULT_CENTER_TARGETS,
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_PERSONAL_KPI,
} from "@/lib/kpi/metrics";
import { DEFAULT_CLASSIFY_CONFIG } from "@/lib/kpi/classify";
import { DEFAULT_ALLOWANCE_CONFIG } from "@/lib/allowance/defaults";
import type { AppConfig, InstructorRow } from "@/lib/kpi/types";
import type { KnownCoach } from "@/lib/kpi/merge";
import type { RunCoach } from "@/lib/types";
import {
  CENTERS,
  type AllowanceConfig,
  type AllowanceInput,
  type AllowanceResult,
  type AllowanceTier,
  type OtherAllowanceItem,
} from "@/lib/allowance/types";

export function defaultConfig(): AppConfig {
  return {
    personalKpi: structuredClone(DEFAULT_PERSONAL_KPI),
    centerKpi: structuredClone(DEFAULT_CENTER_KPI),
    centerTargets: structuredClone(DEFAULT_CENTER_TARGETS),
    gradeThresholds: { ...DEFAULT_GRADE_THRESHOLDS },
    classify: structuredClone(DEFAULT_CLASSIFY_CONFIG),
  };
}

/** Read the singleton config, seeding defaults on first use. */
export const getConfig = cache(async (): Promise<AppConfig> => {
  const db = await getDb();
  const rows = await db.select().from(config).where(eq(config.id, 1)).limit(1);
  // Backfill top-level keys added after a row was first written (e.g. `classify`)
  // so older saved configs gain new defaults without a migration.
  if (rows[0]) return { ...defaultConfig(), ...rows[0].data };
  const data = defaultConfig();
  await db.insert(config).values({ id: 1, data }).onConflictDoNothing();
  return data;
});

export async function saveConfig(data: AppConfig): Promise<void> {
  const db = await getDb();
  await db
    .insert(config)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: config.id, set: { data, updatedAt: new Date() } });
}

export async function listCoaches(): Promise<CoachRecord[]> {
  const db = await getDb();
  return db.select().from(coaches).orderBy(coaches.canonicalName);
}

/** Known aliases for merge reconciliation. */
export async function getKnownCoaches(): Promise<KnownCoach[]> {
  const all = await listCoaches();
  return all
    .filter((c) => c.active)
    .map((c) => ({ canonicalName: c.canonicalName, aliases: c.aliases ?? [] }));
}

export async function getCoach(id: number): Promise<CoachRecord | undefined> {
  const db = await getDb();
  const rows = await db.select().from(coaches).where(eq(coaches.id, id)).limit(1);
  return rows[0];
}

export interface CoachKpiPoint {
  period: string;
  finalScore: number;
  grade: string;
  payout: number;
  students: number;
}

export interface CoachProfileData {
  coach: CoachRecord;
  kpi: CoachKpiPoint[];
  allowance: AllowanceRunSummary[];
}

/**
 * Aggregate one coach's record: identity + KPI history (from saved runs) +
 * allowance history. KPI rows are matched by coachId, canonical name, or any
 * merged account/alias — mirroring `upsertCoachesFromRun`'s precedence.
 */
export async function getCoachProfile(coachId: number): Promise<CoachProfileData | null> {
  const coach = await getCoach(coachId);
  if (!coach) return null;
  const db = await getDb();
  const runRows = await db
    .select({ periodLabel: runs.periodLabel, coachResults: runs.coachResults })
    .from(runs)
    .orderBy(runs.createdAt);

  const names = new Set([coach.canonicalName, ...(coach.aliases ?? [])]);
  const kpi: CoachKpiPoint[] = [];
  for (const r of runRows) {
    const rc = r.coachResults.find(
      (c) =>
        c.coachId === coachId ||
        c.canonicalName === coach.canonicalName ||
        c.accounts.some((a) => names.has(a)),
    );
    if (rc) {
      kpi.push({
        period: r.periodLabel,
        finalScore: rc.finalScore,
        grade: rc.grade,
        payout: rc.payout,
        students: rc.students,
      });
    }
  }

  const allowance = (await listAllowanceRuns()).filter(
    (a) => a.coachId === coachId || a.canonicalName === coach.canonicalName,
  );
  return { coach, kpi, allowance };
}

/** Manually add an employee (distinct from the auto-create on a saved run). */
export async function createCoach(input: {
  canonicalName: string;
  jobRole?: EmployeeRole;
  employmentType?: EmploymentType;
  center?: string;
  allowanceTier?: AllowanceTier | null;
}): Promise<CoachRecord> {
  const db = await getDb();
  const [row] = await db
    .insert(coaches)
    .values({
      canonicalName: input.canonicalName.trim(),
      jobRole: input.jobRole ?? "instructor",
      employmentType: input.employmentType ?? "full_time",
      center: input.center?.trim() ?? "",
      allowanceTier: input.allowanceTier ?? null,
    })
    .returning();
  return row;
}

/** Update editable staff profile fields. */
export async function updateCoach(
  id: number,
  patch: Partial<
    Pick<
      CoachRecord,
      "canonicalName" | "center" | "allowanceTier" | "active" | "jobRole" | "employmentType"
    >
  >,
): Promise<void> {
  const db = await getDb();
  await db
    .update(coaches)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(coaches.id, id));
}

/** Permanently remove a staff profile. Saved allowance/KPI records are kept. */
export async function deleteCoach(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(coaches).where(eq(coaches.id, id));
}

/**
 * Persist/refresh coach profiles from a finalized run: union aliases, remember
 * position, and carry forward the latest management assessment + allowance.
 */
export async function upsertCoachesFromRun(coachResults: RunCoach[]): Promise<void> {
  const db = await getDb();
  const existing = await listCoaches();

  for (const rc of coachResults) {
    const match =
      (rc.coachId && existing.find((c) => c.id === rc.coachId)) ||
      existing.find((c) => c.canonicalName === rc.canonicalName) ||
      existing.find((c) => c.aliases?.some((a) => rc.accounts.includes(a)));

    const mergedAliases = [...new Set([...(match?.aliases ?? []), ...rc.accounts])].sort();
    const mgmtUpdate =
      rc.mgmtAssessment != null
        ? { lastMgmtAssessment: rc.mgmtAssessment, lastMgmtAssessmentAt: new Date() }
        : {};

    if (match) {
      await db
        .update(coaches)
        .set({
          aliases: mergedAliases,
          center: rc.center || match.center,
          defaultPosition: rc.position,
          lastAllowance: rc.teachingAllowance ?? match.lastAllowance,
          ...mgmtUpdate,
          updatedAt: new Date(),
        })
        .where(eq(coaches.id, match.id));
    } else {
      await db.insert(coaches).values({
        canonicalName: rc.canonicalName,
        aliases: mergedAliases,
        center: rc.center,
        defaultPosition: rc.position,
        lastAllowance: rc.teachingAllowance,
        lastMgmtAssessment: rc.mgmtAssessment ?? null,
        lastMgmtAssessmentAt: rc.mgmtAssessment != null ? new Date() : null,
      });
    }
  }
}

export interface RunSummary {
  id: number;
  periodLabel: string;
  filename: string;
  status: string;
  createdAt: Date;
  coachCount: number;
  totalPayout: number;
}

export async function listRuns(): Promise<RunSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: runs.id,
      periodLabel: runs.periodLabel,
      filename: runs.filename,
      status: runs.status,
      createdAt: runs.createdAt,
      coachResults: runs.coachResults,
    })
    .from(runs)
    .orderBy(desc(runs.createdAt));
  return rows.map((r) => ({
    id: r.id,
    periodLabel: r.periodLabel,
    filename: r.filename,
    status: r.status,
    createdAt: r.createdAt,
    coachCount: r.coachResults.length,
    totalPayout: r.coachResults.reduce((s, c) => s + (c.payout || 0), 0),
  }));
}

export interface TrendData {
  periods: string[];
  coaches: { name: string; points: { period: string; score: number; payout: number }[] }[];
}

/** Per-coach final score + payout across all saved months, for the Trends page. */
export async function getTrendData(): Promise<TrendData> {
  const db = await getDb();
  const rows = await db
    .select({
      periodLabel: runs.periodLabel,
      coachResults: runs.coachResults,
    })
    .from(runs)
    .orderBy(runs.createdAt);

  const periods: string[] = [];
  const byCoach = new Map<string, TrendData["coaches"][number]>();
  for (const r of rows) {
    if (!periods.includes(r.periodLabel)) periods.push(r.periodLabel);
    for (const c of r.coachResults) {
      const entry = byCoach.get(c.canonicalName) ?? { name: c.canonicalName, points: [] };
      entry.points.push({ period: r.periodLabel, score: c.finalScore, payout: c.payout });
      byCoach.set(c.canonicalName, entry);
    }
  }
  return {
    periods,
    coaches: [...byCoach.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function getRun(id: number): Promise<RunRecord | undefined> {
  const db = await getDb();
  const rows = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  return rows[0];
}

export async function createRun(input: {
  periodLabel: string;
  filename: string;
  csvRows: InstructorRow[];
  configSnapshot: AppConfig;
  coachResults: RunCoach[];
}): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(runs)
    .values({ ...input, status: "finalized" })
    .returning({ id: runs.id });
  await upsertCoachesFromRun(input.coachResults);
  return row.id;
}

export async function deleteRun(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(runs).where(eq(runs.id, id));
}

// ── Allowance ────────────────────────────────────────────────────────────────

/** Read the singleton allowance rate tables, seeding defaults on first use. */
export const getAllowanceConfig = cache(async (): Promise<AllowanceConfig> => {
  const db = await getDb();
  const rows = await db
    .select()
    .from(allowanceConfig)
    .where(eq(allowanceConfig.id, 1))
    .limit(1);
  if (rows[0]) {
    const data = rows[0].data;
    // Backfill the center list for configs saved before centers were configurable.
    if (!Array.isArray(data.centers) || data.centers.length === 0) {
      data.centers = [...CENTERS];
    }
    return data;
  }
  const data = structuredClone(DEFAULT_ALLOWANCE_CONFIG);
  await db.insert(allowanceConfig).values({ id: 1, data }).onConflictDoNothing();
  return data;
});

export async function saveAllowanceConfig(data: AllowanceConfig): Promise<void> {
  const db = await getDb();
  await db
    .insert(allowanceConfig)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: allowanceConfig.id, set: { data, updatedAt: new Date() } });
}

/**
 * Save the allowance rate tables while preserving the stored centers list.
 * Centers are managed via Staff -> Settings; the rates form must never overwrite
 * them, even if the payload carries a stale or empty `centers` array.
 */
export async function saveAllowanceRates(payload: AllowanceConfig): Promise<void> {
  const current = await getAllowanceConfig();
  await saveAllowanceConfig({ ...payload, centers: current.centers });
}

/**
 * Replace the centers list while preserving the allowance rate tables.
 * Trims, drops blanks, and dedupes (order-preserving).
 */
export async function saveCenters(centers: readonly unknown[]): Promise<void> {
  const normalized = [...new Set(centers.map((c) => String(c).trim()).filter(Boolean))];
  const current = await getAllowanceConfig();
  await saveAllowanceConfig({ ...current, centers: normalized });
}

/**
 * Resolve (or create) the coach profile an allowance record belongs to, and
 * remember the pay tier for next month. Returns the coach id. Mirrors the
 * matching in `upsertCoachesFromRun`, but only touches `allowanceTier`/`center`
 * — never the KPI carry-over fields (`lastAllowance` / `lastMgmtAssessment`).
 */
export async function ensureCoachForAllowance(opts: {
  coachId: number | null;
  canonicalName: string;
  center: string;
  tier: AllowanceTier;
}): Promise<number> {
  const db = await getDb();
  const existing = await listCoaches();
  const match =
    (opts.coachId ? existing.find((c) => c.id === opts.coachId) : undefined) ||
    existing.find((c) => c.canonicalName === opts.canonicalName);

  if (match) {
    await db
      .update(coaches)
      .set({ allowanceTier: opts.tier, center: match.center || opts.center, updatedAt: new Date() })
      .where(eq(coaches.id, match.id));
    return match.id;
  }

  const [row] = await db
    .insert(coaches)
    .values({ canonicalName: opts.canonicalName, center: opts.center, allowanceTier: opts.tier })
    .returning({ id: coaches.id });
  return row.id;
}

/**
 * Save one coach's month. One record per coach per period: any existing
 * (periodLabel, canonicalName) entry is replaced so re-saving is idempotent.
 */
export async function createAllowanceRun(data: {
  periodLabel: string;
  input: AllowanceInput;
  result: AllowanceResult;
  configSnapshot: AllowanceConfig;
}): Promise<number> {
  const db = await getDb();
  const coachId = await ensureCoachForAllowance({
    coachId: data.input.coachId,
    canonicalName: data.input.name,
    center: data.input.center,
    tier: data.input.tier,
  });

  await db
    .delete(allowanceRuns)
    .where(
      and(
        eq(allowanceRuns.periodLabel, data.periodLabel),
        eq(allowanceRuns.canonicalName, data.input.name),
      ),
    );

  const [row] = await db
    .insert(allowanceRuns)
    .values({
      periodLabel: data.periodLabel,
      coachId,
      canonicalName: data.input.name,
      tier: data.input.tier,
      center: data.input.center,
      input: { ...data.input, coachId },
      result: data.result,
      configSnapshot: data.configSnapshot,
    })
    .returning({ id: allowanceRuns.id });
  return row.id;
}

export interface AllowanceRunSummary {
  id: number;
  periodLabel: string;
  coachId: number | null;
  canonicalName: string;
  tier: AllowanceTier;
  center: string;
  opHours: number;
  leaveHours: number;
  attendancePct: number;
  attendance: number;
  teaching: number;
  other: number;
  otherItems: OtherAllowanceItem[];
  grandTotal: number;
  createdAt: Date;
}

/** List allowance records (optionally one month), with the full breakdown for export. */
export async function listAllowanceRuns(period?: string): Promise<AllowanceRunSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: allowanceRuns.id,
      periodLabel: allowanceRuns.periodLabel,
      coachId: allowanceRuns.coachId,
      canonicalName: allowanceRuns.canonicalName,
      tier: allowanceRuns.tier,
      center: allowanceRuns.center,
      input: allowanceRuns.input,
      result: allowanceRuns.result,
      createdAt: allowanceRuns.createdAt,
    })
    .from(allowanceRuns)
    .where(period ? eq(allowanceRuns.periodLabel, period) : undefined)
    .orderBy(desc(allowanceRuns.createdAt));
  return rows.map((r) => ({
    id: r.id,
    periodLabel: r.periodLabel,
    coachId: r.coachId,
    canonicalName: r.canonicalName,
    tier: r.tier,
    center: r.center,
    opHours: r.input.opHours,
    leaveHours: r.input.leaveHours,
    attendancePct: r.result.attendancePct,
    attendance: r.result.attendance,
    teaching: r.result.teaching,
    other: r.result.other,
    otherItems: r.input.otherItems ?? [],
    grandTotal: r.result.grandTotal,
    createdAt: r.createdAt,
  }));
}

/**
 * Full saved `AllowanceInput` per coach for one month, keyed by canonical name.
 * Used by the bulk-by-center entry screen to prefill and — crucially — to merge
 * a new center's hours into an existing multi-center record without clobbering
 * the other center's data.
 */
export async function getAllowanceInputsForPeriod(
  period: string,
): Promise<Map<string, AllowanceInput>> {
  const db = await getDb();
  const rows = await db
    .select({ canonicalName: allowanceRuns.canonicalName, input: allowanceRuns.input })
    .from(allowanceRuns)
    .where(eq(allowanceRuns.periodLabel, period));
  const map = new Map<string, AllowanceInput>();
  for (const r of rows) map.set(r.canonicalName, r.input);
  return map;
}

export interface AllowanceTrendData {
  periods: string[];
  byStaff: { name: string; points: { period: string; total: number }[] }[];
  byCenter: { name: string; points: { period: string; total: number }[] }[];
}

/**
 * Month-over-month allowance totals for the Trends page: each staff member's
 * grand total per period, and each center's summed total per period.
 *
 * Center attribution for a multi-center month splits the record's totals by
 * teaching hours: a center gets its hours-proportional slice of the teaching
 * subtotal, plus an even share of attendance+other across the distinct centers
 * taught that month. A record with no teaching rows is attributed whole to its
 * center label. Per-period center slices therefore sum back to the staff total.
 */
export async function getAllowanceTrendData(): Promise<AllowanceTrendData> {
  const db = await getDb();
  const rows = await db
    .select({
      periodLabel: allowanceRuns.periodLabel,
      canonicalName: allowanceRuns.canonicalName,
      input: allowanceRuns.input,
      result: allowanceRuns.result,
    })
    .from(allowanceRuns)
    .orderBy(allowanceRuns.periodLabel);

  const periods: string[] = [];
  const staff = new Map<string, Map<string, number>>();
  const center = new Map<string, Map<string, number>>();

  const add = (map: Map<string, Map<string, number>>, key: string, period: string, v: number) => {
    const byPeriod = map.get(key) ?? new Map<string, number>();
    byPeriod.set(period, (byPeriod.get(period) ?? 0) + v);
    map.set(key, byPeriod);
  };

  for (const r of rows) {
    if (!periods.includes(r.periodLabel)) periods.push(r.periodLabel);
    add(staff, r.canonicalName, r.periodLabel, r.result.grandTotal);

    // Hours per center (sum of all class types), to weight the teaching subtotal.
    const hoursByCenter = new Map<string, number>();
    for (const t of r.input.teachingRows) {
      const c = t.center.trim();
      if (!c) continue;
      hoursByCenter.set(c, (hoursByCenter.get(c) ?? 0) + t.normalH + t.ysH + t.precompH);
    }
    const centers = [...hoursByCenter.keys()];
    const totalHours = [...hoursByCenter.values()].reduce((s, h) => s + h, 0);

    if (centers.length === 0) {
      add(center, r.input.center.trim() || "—", r.periodLabel, r.result.grandTotal);
      continue;
    }
    const evenShare = (r.result.attendance + r.result.other) / centers.length;
    for (const c of centers) {
      const teachSlice =
        totalHours > 0
          ? (r.result.teaching * (hoursByCenter.get(c) ?? 0)) / totalHours
          : r.result.teaching / centers.length;
      add(center, c, r.periodLabel, teachSlice + evenShare);
    }
  }

  const toSeries = (map: Map<string, Map<string, number>>) =>
    [...map.entries()]
      .map(([name, byPeriod]) => ({
        name,
        points: periods
          .filter((p) => byPeriod.has(p))
          .map((p) => ({ period: p, total: Math.round(byPeriod.get(p) ?? 0) })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

  return { periods, byStaff: toSeries(staff), byCenter: toSeries(center) };
}

export async function getAllowanceRun(id: number): Promise<AllowanceRunRecord | undefined> {
  const db = await getDb();
  const rows = await db.select().from(allowanceRuns).where(eq(allowanceRuns.id, id)).limit(1);
  return rows[0];
}

export async function deleteAllowanceRun(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(allowanceRuns).where(eq(allowanceRuns.id, id));
}

// ── Allowance period locks ─────────────────────────────────────────────────────

/** All locked allowance months, newest first. */
export async function listAllowanceLocks(): Promise<AllowancePeriodLockRecord[]> {
  const db = await getDb();
  return db.select().from(allowancePeriodLocks).orderBy(desc(allowancePeriodLocks.periodLabel));
}

/** The set of locked period labels (for cheap membership checks in the UI). */
export async function getLockedPeriods(): Promise<Set<string>> {
  const rows = await listAllowanceLocks();
  return new Set(rows.map((r) => r.periodLabel));
}

/** True when `period` is locked (closed for edits). */
export async function isPeriodLocked(period: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ periodLabel: allowancePeriodLocks.periodLabel })
    .from(allowancePeriodLocks)
    .where(eq(allowancePeriodLocks.periodLabel, period))
    .limit(1);
  return rows.length > 0;
}

/** Close a month: idempotent (re-locking just refreshes who/when). */
export async function lockPeriod(period: string, lockedBy: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(allowancePeriodLocks)
    .values({ periodLabel: period, lockedBy })
    .onConflictDoUpdate({
      target: allowancePeriodLocks.periodLabel,
      set: { lockedBy, lockedAt: new Date() },
    });
}

/** Re-open a month. No-op if it wasn't locked. */
export async function unlockPeriod(period: string): Promise<void> {
  const db = await getDb();
  await db.delete(allowancePeriodLocks).where(eq(allowancePeriodLocks.periodLabel, period));
}

/**
 * Map of allowance-run id → the email of whoever last saved (i.e. last edited)
 * it, read from the audit log's `allowance.save` entries. Powers the edit
 * attribution shown to admins. Only covers saves recorded since the audit log
 * existed; older runs map to nothing.
 */
export async function getAllowanceSavers(): Promise<Record<number, string>> {
  const db = await getDb();
  const rows = await db
    .select({ entityId: auditLog.entityId, actorEmail: auditLog.actorEmail })
    .from(auditLog)
    .where(and(eq(auditLog.entity, "allowance_run"), eq(auditLog.action, "allowance.save")))
    .orderBy(auditLog.createdAt, auditLog.id);
  const byRun: Record<number, string> = {};
  for (const r of rows) {
    const id = Number(r.entityId);
    if (Number.isFinite(id) && r.actorEmail) byRun[id] = r.actorEmail; // ascending ⇒ latest wins
  }
  return byRun;
}

// ── Users / auth ───────────────────────────────────────────────────────────

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function listUsers(): Promise<UserRecord[]> {
  const db = await getDb();
  return db.select().from(users).orderBy(users.email);
}

export const getUserById = cache(async (id: number): Promise<UserRecord | undefined> => {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
});

export async function getUserByEmail(email: string): Promise<UserRecord | undefined> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return rows[0];
}

export async function countUsers(): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ id: users.id }).from(users);
  return rows.length;
}

export async function createUser(input: {
  email: string;
  password: string;
  role: Role;
  coachId?: number | null;
}): Promise<UserRecord> {
  const db = await getDb();
  const email = normalizeEmail(input.email);
  if (await getUserByEmail(email)) {
    throw new Error("A user with that email already exists.");
  }
  const [row] = await db
    .insert(users)
    .values({
      email,
      passwordHash: hashPassword(input.password),
      role: input.role,
      coachId: input.coachId ?? null,
    })
    .returning();
  return row;
}

export async function updateUser(
  id: number,
  patch: {
    email?: string;
    role?: Role;
    active?: boolean;
    coachId?: number | null;
    password?: string;
  },
): Promise<void> {
  const db = await getDb();
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (patch.email !== undefined) {
    const email = normalizeEmail(patch.email);
    const existing = await getUserByEmail(email);
    if (existing && existing.id !== id) {
      throw new Error("A user with that email already exists.");
    }
    set.email = email;
  }
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.coachId !== undefined) set.coachId = patch.coachId;
  if (patch.password) set.passwordHash = hashPassword(patch.password);
  await db.update(users).set(set).where(eq(users.id, id));
}

export async function deleteUser(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(users).where(eq(users.id, id));
}

/**
 * Backfill any configurable role missing from a stored matrix with its
 * defaults — lets a newly added role (e.g. supervisor) work on deployments
 * whose matrix was saved before the role existed, with no migration.
 */
function normalizePermissionConfig(data: PermissionConfig): PermissionConfig {
  const out: PermissionConfig = { ...data };
  for (const role of CONFIGURABLE_ROLES) {
    if (!Array.isArray(out[role])) out[role] = [...DEFAULT_PERMISSION_CONFIG[role]];
  }
  return out;
}

/** Read the singleton permission matrix, seeding defaults on first use. */
export const getPermissionConfig = cache(async (): Promise<PermissionConfig> => {
  const db = await getDb();
  const rows = await db
    .select()
    .from(permissionConfig)
    .where(eq(permissionConfig.id, 1))
    .limit(1);
  if (rows[0]) return normalizePermissionConfig(rows[0].data);
  const data = structuredClone(DEFAULT_PERMISSION_CONFIG);
  await db.insert(permissionConfig).values({ id: 1, data }).onConflictDoNothing();
  return data;
});

export async function savePermissionConfig(data: PermissionConfig): Promise<void> {
  const db = await getDb();
  await db
    .insert(permissionConfig)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: permissionConfig.id, set: { data, updatedAt: new Date() } });
}

// ── Performance / appraisals ─────────────────────────────────────────────────

/** Read the singleton appraisal config, seeding defaults on first use. */
export const getPerformanceConfig = cache(async (): Promise<PerformanceConfig> => {
  const db = await getDb();
  const rows = await db
    .select()
    .from(performanceConfig)
    .where(eq(performanceConfig.id, 1))
    .limit(1);
  if (rows[0]) return rows[0].data;
  const data = structuredClone(DEFAULT_PERFORMANCE_CONFIG);
  await db.insert(performanceConfig).values({ id: 1, data }).onConflictDoNothing();
  return data;
});

export async function savePerformanceConfig(data: PerformanceConfig): Promise<void> {
  const db = await getDb();
  await db
    .insert(performanceConfig)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: performanceConfig.id, set: { data, updatedAt: new Date() } });
}

export async function listAppraisalsForCoach(coachId: number): Promise<AppraisalRecord[]> {
  const db = await getDb();
  return db
    .select()
    .from(appraisals)
    .where(eq(appraisals.coachId, coachId))
    .orderBy(desc(appraisals.reviewDate));
}

export async function createAppraisal(input: {
  coachId: number;
  periodLabel: string;
  reviewDate: Date;
  reviewedBy: string;
  ratings: AppraisalRating[];
  overallScore: number;
  comments: string;
}): Promise<AppraisalRecord> {
  const db = await getDb();
  const [row] = await db.insert(appraisals).values(input).returning();
  return row;
}

export async function updateAppraisal(
  id: number,
  patch: Partial<
    Pick<AppraisalRecord, "periodLabel" | "reviewDate" | "ratings" | "overallScore" | "comments">
  >,
): Promise<void> {
  const db = await getDb();
  await db.update(appraisals).set(patch).where(eq(appraisals.id, id));
}

export async function deleteAppraisal(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(appraisals).where(eq(appraisals.id, id));
}

export async function listNotesForCoach(coachId: number): Promise<NoteRecord[]> {
  const db = await getDb();
  return db.select().from(notes).where(eq(notes.coachId, coachId)).orderBy(desc(notes.noteDate));
}

export async function createNote(input: {
  coachId: number;
  noteDate: Date;
  type: NoteType;
  title: string;
  body: string;
  severity: NoteSeverity | null;
  followUp: boolean;
  authoredBy: string;
}): Promise<NoteRecord> {
  const db = await getDb();
  const [row] = await db.insert(notes).values(input).returning();
  return row;
}

export async function deleteNote(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(notes).where(eq(notes.id, id));
}

/** Latest appraisal overall (0–100) per coach, for prefilling the KPI mgmt assessment. */
export async function getLatestAppraisalOverallByCoach(): Promise<Map<number, number>> {
  const db = await getDb();
  const rows = await db
    .select({ coachId: appraisals.coachId, overallScore: appraisals.overallScore })
    .from(appraisals)
    .orderBy(desc(appraisals.reviewDate));
  const map = new Map<number, number>();
  for (const r of rows) {
    if (!map.has(r.coachId)) map.set(r.coachId, r.overallScore); // desc order ⇒ first seen is latest
  }
  return map;
}

/**
 * Seed the first super_admin so a fresh deployment is loginable. No-op once any
 * user exists. In production both env vars are required; locally they fall back
 * to admin@local / swim123 so dev works with no setup.
 */
export async function ensureSuperAdmin(): Promise<void> {
  const db = await getDb();
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const isProd = process.env.NODE_ENV === "production";
  const email = process.env.SUPER_ADMIN_EMAIL || (isProd ? undefined : "admin@local");
  const password = process.env.SUPER_ADMIN_PASSWORD || (isProd ? undefined : "swim123");
  if (!email || !password) return; // prod without creds: cannot seed (login route surfaces this)

  await db
    .insert(users)
    .values({
      email: normalizeEmail(email),
      passwordHash: hashPassword(password),
      role: "super_admin",
      active: true,
    })
    .onConflictDoNothing();
}

/* ----------------------------------- audit log ---------------------------------- */

export interface AuditEntry {
  actorId: number | null;
  actorEmail: string;
  action: string;
  entity: string;
  entityId?: string | number | null;
  summary: string;
}

/**
 * Append one audit record. Deliberately swallows its own errors — an audit-write
 * failure must never break (or roll back) the user action that triggered it.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLog).values({
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId == null ? null : String(entry.entityId),
      summary: entry.summary,
    });
  } catch (err) {
    logger.error("recordAudit failed", { err });
  }
}

/** Most recent audit entries first. */
export async function listAuditLog(limit = 200): Promise<AuditLogRecord[]> {
  const db = await getDb();
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(limit);
}
