import { cache } from "react";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, type DB } from "./index";
import { logger } from "@/lib/log";
import {
  allowanceConfig,
  allowancePeriodLocks,
  allowanceRuns,
  assessments,
  auditLog,
  coaches,
  commissionConfig,
  commissionRuns,
  teachingConfig,
  teachingRuns,
  gymNotes,
  gymStaff,
  config,
  notes,
  permissionConfig,
  runs,
  users,
  type AllowancePeriodLockRecord,
  type AllowanceRunRecord,
  type AssessmentRecord,
  type AuditLogRecord,
  type CoachRecord,
  type CommissionRunRecord,
  type GymNoteRecord,
  type GymStaffRecord,
  type TeachingRunRecord,
  type NoteRecord,
  type RunRecord,
  type UserRecord,
} from "./schema";
import { hashPassword } from "@/lib/auth/password";
import { CONFIGURABLE_ROLES, DEFAULT_PERMISSION_CONFIG, type Capability, type PermissionConfig, type Role, type ToolCategory } from "@/lib/auth/types";
import type {
  EmployeeRole,
  EmploymentType,
  NoteSeverity,
  NoteType,
} from "@/lib/performance/types";
import type { GradeKey, RatingMap } from "@/lib/assessment/types";
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
import { defaultCommissionConfig } from "@/lib/commission/defaults";
import type { CommissionConfig, CommissionRow, CommissionSummary } from "@/lib/commission/types";
import { defaultTeachingConfig } from "@/lib/teaching/defaults";
import type { TeachingConfig, TeachingRow, TeachingSummary } from "@/lib/teaching/types";
import type { GymStaffInput } from "@/lib/gym/types";
import {
  extractStaffMonth,
  matcherFor,
  staffEarnings,
  unmatchedEarners,
  type StaffEarningsReport,
  type StaffMonthDetail,
  type UnmatchedEarner,
} from "@/lib/earnings/income";
import type { RunCoach } from "@/lib/types";
import {
  CENTERS,
  type AllowanceConfig,
  type AllowanceInput,
  type AllowanceResult,
  type AllowanceTier,
  type OtherAllowanceItem,
} from "@/lib/allowance/types";
import { previousPeriod } from "@/lib/allowance/period";
import { jobRoleForTier } from "@/lib/allowance/tier-rules";

/**
 * A query executor: either the pooled `DB` or a transaction handle. The tx type
 * is derived from `db.transaction(...)`'s callback so it's exactly compatible.
 * Read-modify-write helpers accept this so they can run standalone (own
 * connection) or be threaded into a caller's transaction, making the whole
 * read→write atomic. PGlite supports `transaction` too.
 */
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type DbOrTx = DB | Tx;

/**
 * Take a transaction-scoped advisory lock keyed on an allowance period. Both the
 * "save a run if unlocked" and "lock the period" paths acquire it on the same key,
 * so the two operations fully serialize even when no lock *row* exists yet — a
 * plain `SELECT … FOR UPDATE` only locks an existing row and so couldn't close the
 * first-ever-lock TOCTOU on its own. Released automatically when the tx ends.
 *
 * (PGlite supports `pg_advisory_xact_lock`, verified; single-writer there makes it
 * a near-no-op, but the lock still resolves correctly so the code path is shared.)
 */
async function lockPeriodAdvisory(tx: Tx, period: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${period}))`);
}

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
// ── Cached singletons ─────────────────────────────────────────────────────────
/**
 * Per-process cache for the rarely-changing singleton config rows AND the
 * heavier run-list / trend aggregations. They're read on most page loads;
 * without this every navigation re-hits the DB (a network round-trip on Neon — a
 * big chunk of TTFB). A save invalidates this instance immediately; other
 * instances refresh within the TTL.
 *
 * The cached value is deep-frozen once at store time and returned directly (no
 * per-read clone). Freezing — not cloning — is what guarantees callers can't
 * corrupt the shared value, and it's free on every subsequent read, which
 * matters for the large run-list/trend arrays that used to be `structuredClone`d
 * on every hit. Callers treat these results as read-only.
 */
const SINGLETON_TTL_MS = 60_000;
const singletonCache = new Map<string, { value: unknown; at: number }>();

/** Recursively freeze an object graph so a shared cached value can't be mutated. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/** A plain (non-array, non-null) object — the only thing deepMerge recurses into. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Recursively backfill `stored` with `defaults`: plain objects are merged key by
 * key; arrays and primitives present in `stored` win wholesale (a stored array is
 * never element-merged with a default array). Used by the singleton config
 * getters so a NEW nested field added inside a metric/rate object gains its
 * default for configs written before that field existed — something the old
 * one-level `{ ...defaults(), ...stored }` spread missed. A config that already
 * has every key is returned byte-for-byte equal to `stored` (only missing keys
 * are filled), so existing configs are unchanged.
 */
function deepMerge<T>(defaults: T, stored: unknown): T {
  if (!isPlainObject(defaults) || !isPlainObject(stored)) {
    // `stored` (when defined) always wins over the default at the leaf level.
    return (stored === undefined ? defaults : (stored as T));
  }
  const out: Record<string, unknown> = { ...stored };
  for (const [key, dflt] of Object.entries(defaults)) {
    out[key] = key in stored ? deepMerge(dflt, stored[key]) : dflt;
  }
  return out as T;
}

function memoizedSingleton<T>(key: string, read: () => Promise<T>): () => Promise<T> {
  return async () => {
    const hit = singletonCache.get(key);
    if (hit && Date.now() - hit.at < SINGLETON_TTL_MS) return hit.value as T;
    const value = deepFreeze(await read());
    singletonCache.set(key, { value, at: Date.now() });
    return value;
  };
}

function invalidateSingleton(key: string): void {
  singletonCache.delete(key);
}

export const getConfig = memoizedSingleton("kpi-config", async (): Promise<AppConfig> => {
  const db = await getDb();
  const rows = await db.select().from(config).where(eq(config.id, 1)).limit(1);
  // Backfill keys added after a row was first written (e.g. `classify`, or a new
  // field nested inside a metric) so older saved configs gain new defaults
  // without a migration. Deep so nested additions backfill too.
  if (rows[0]) return deepMerge(defaultConfig(), rows[0].data);
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
  invalidateSingleton("kpi-config");
}

/** List coach profiles on a given executor (the pool or an open transaction). */
function listCoachesWith(exec: DbOrTx): Promise<CoachRecord[]> {
  return exec.select().from(coaches).orderBy(coaches.canonicalName);
}

export async function listCoaches(): Promise<CoachRecord[]> {
  const db = await getDb();
  return listCoachesWith(db);
}

/** Known aliases for merge reconciliation. */
export async function getKnownCoaches(): Promise<KnownCoach[]> {
  const all = await listCoaches();
  return all
    .filter((c) => c.active)
    .map((c) => ({ canonicalName: c.canonicalName, aliases: c.aliases ?? [] }));
}

/**
 * Distinct account names for the alias-edit search on /kpi/links, A–Z. Drawn from
 * BOTH sources so the list survives data changes:
 *  - every saved run's CSV instructor names (accounts seen in uploads), and
 *  - every coach's existing aliases (already-confirmed account names).
 *
 * Including coach aliases matters because runs can be deleted: if the only run
 * that contained an account is removed, that account would otherwise vanish from
 * the suggestions even though it's still a coach's known alias.
 */
export async function listAllCsvAccountNames(): Promise<string[]> {
  const db = await getDb();
  const [runRows, coachRows] = await Promise.all([
    db.select({ csvRows: runs.csvRows }).from(runs),
    db.select({ aliases: coaches.aliases }).from(coaches),
  ]);
  const names = new Set<string>();
  for (const r of runRows) {
    for (const row of r.csvRows ?? []) {
      const n = row.Instructor?.trim();
      if (n) names.add(n);
    }
  }
  for (const c of coachRows) {
    for (const a of c.aliases ?? []) {
      const n = a?.trim();
      if (n) names.add(n);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
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
      // Rule: A1/A2/A3 are front desk, every other tier is an instructor. The
      // user-facing API never passes jobRole, so the role follows the tier; an
      // explicit jobRole is accepted only for seeding (e.g. the migration test).
      jobRole: input.jobRole ?? jobRoleForTier(input.allowanceTier ?? null),
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

/** Replace a coach's account aliases (used by the KPI link manager). */
export async function updateCoachAliases(id: number, aliases: string[]): Promise<void> {
  const db = await getDb();
  await db
    .update(coaches)
    .set({ aliases, updatedAt: new Date() })
    .where(eq(coaches.id, id));
}

/**
 * Set (or clear) a coach's "not applicable for KPI linking" override. When
 * setting it, snapshot the tier it was set at so the link panel can re-surface
 * the coach if they later move up to a teaching tier.
 */
export async function setCoachKpiLinkNa(
  id: number,
  na: boolean,
  tier: AllowanceTier | null = null,
): Promise<void> {
  const db = await getDb();
  await db
    .update(coaches)
    .set({
      kpiLinkNa: na,
      kpiLinkNaTier: na ? tier : null,
      updatedAt: new Date(),
    })
    .where(eq(coaches.id, id));
}

/**
 * Permanently remove a staff profile and clean up its dependents in one
 * transaction (no DB-level FKs exist, so we cascade by hand): unlink any login
 * that pointed at this coach (`users.coachId → null`) and delete the coach's
 * assessments + HR notes. Saved allowance/KPI run history and the audit log are
 * intentionally kept — those orphans are documented as deliberate.
 */
export async function deleteCoach(id: number): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ coachId: null, updatedAt: new Date() }).where(eq(users.coachId, id));
    await tx.delete(assessments).where(eq(assessments.coachId, id));
    await tx.delete(notes).where(eq(notes.coachId, id));
    await tx.delete(coaches).where(eq(coaches.id, id));
  });
}

/**
 * Persist/refresh coach profiles from a finalized run: union aliases, remember
 * position, and carry forward the latest management assessment + allowance.
 */
export async function upsertCoachesFromRun(coachResults: RunCoach[]): Promise<void> {
  const db = await getDb();
  // One transaction so the `listCoaches` read + conditional insert is atomic:
  // two concurrent finalized runs can't both miss the same coach and each insert
  // a duplicate profile.
  await db.transaction(async (tx) => {
    const existing = await listCoachesWith(tx);
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
        await tx
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
        await tx.insert(coaches).values({
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
  });
}

/** One coach's headline result within a saved month (for the History accordion). */
export interface RunCoachRow {
  canonicalName: string;
  center: string;
  students: number;
  position: string;
  finalScore: number;
  grade: string;
  teachingAllowance: number | null;
  payout: number;
  isComplete: boolean;
}

export interface RunSummary {
  id: number;
  periodLabel: string;
  filename: string;
  status: string;
  createdAt: Date;
  coachCount: number;
  totalPayout: number;
  /** Per-coach results (sorted by score desc) so History can expand a month inline. */
  coaches: RunCoachRow[];
}

// Cached: KPI history list. Invalidated immediately on any run save/edit/delete
// (below), with the TTL as a backstop.
export const listRuns = memoizedSingleton("kpi-runs", _listRuns);
async function _listRuns(): Promise<RunSummary[]> {
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
    coaches: [...r.coachResults]
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((c) => ({
        canonicalName: c.canonicalName,
        center: c.center,
        students: c.students,
        position: c.position,
        finalScore: c.finalScore,
        grade: c.grade,
        teachingAllowance: c.teachingAllowance,
        payout: c.payout,
        isComplete: c.isComplete,
      })),
  }));
}

export interface TrendData {
  periods: string[];
  coaches: { name: string; points: { period: string; score: number; payout: number }[] }[];
}

/** Per-coach final score + payout across all saved months, for the Trends page. */
// Cached: KPI trend aggregation (reads every run). Invalidated on run changes;
// the TTL also bounds staleness for this analytical view.
export const getTrendData = memoizedSingleton("kpi-trend", _getTrendData);
async function _getTrendData(): Promise<TrendData> {
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

/**
 * A month is a draft until every shown coach has its required inputs (most
 * commonly the management assessment, which a manager fills after the upload).
 */
export function runStatusFromResults(coachResults: RunCoach[]): "draft" | "finalized" {
  return coachResults.length > 0 && coachResults.every((c) => c.isComplete)
    ? "finalized"
    : "draft";
}

export async function createRun(input: {
  periodLabel: string;
  filename: string;
  csvRows: InstructorRow[];
  configSnapshot: AppConfig;
  coachResults: RunCoach[];
  status?: "draft" | "finalized";
}): Promise<number> {
  const db = await getDb();
  const status = input.status ?? "finalized";
  const [row] = await db
    .insert(runs)
    .values({
      periodLabel: input.periodLabel,
      filename: input.filename,
      csvRows: input.csvRows,
      configSnapshot: input.configSnapshot,
      coachResults: input.coachResults,
      status,
    })
    .returning({ id: runs.id });
  // Carry coach profiles forward (allowance, mgmt, aliases) only once the month is
  // finalized, so a draft's pending/empty inputs never pollute next month's carry-over.
  if (status === "finalized") await upsertCoachesFromRun(input.coachResults);
  invalidateSingleton("kpi-runs");
  invalidateSingleton("kpi-trend");
  return row.id;
}

/**
 * Save a management review back onto a run: replace the (client-recomputed) coach
 * results and set the new status. Carries profiles forward when finalizing.
 */
export async function updateRunReview(
  id: number,
  coachResults: RunCoach[],
  status: "draft" | "finalized",
): Promise<void> {
  const db = await getDb();
  await db.update(runs).set({ coachResults, status }).where(eq(runs.id, id));
  if (status === "finalized") await upsertCoachesFromRun(coachResults);
  invalidateSingleton("kpi-runs");
  invalidateSingleton("kpi-trend");
}

/**
 * Reopen a finalized month for correction: flip its status back to "draft" so the
 * management-review screen becomes editable again (the KPI mirror of unlocking a
 * Saved Allowances month). Coach results are left untouched. Scoped to a run that
 * is currently "finalized", so it's a safe no-op on a draft; returns whether a row
 * was actually reopened.
 *
 * Note: the carry-forward coach profiles written when the month was finalized
 * (`upsertCoachesFromRun`) are NOT rolled back — they're "last known" hints and get
 * overwritten when the month is re-finalized.
 */
export async function reopenRun(id: number): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(runs)
    .set({ status: "draft" })
    .where(and(eq(runs.id, id), eq(runs.status, "finalized")))
    .returning({ id: runs.id });
  if (rows.length === 0) return false;
  invalidateSingleton("kpi-runs");
  invalidateSingleton("kpi-trend");
  return true;
}

export async function deleteRun(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(runs).where(eq(runs.id, id));
  invalidateSingleton("kpi-runs");
  invalidateSingleton("kpi-trend");
}

// ── Commission (Optimum Fit) ──────────────────────────────────────────────────

/** Read the singleton commission rate bands, seeding spec defaults on first use. */
export const getCommissionConfig = memoizedSingleton("commission-config", async (): Promise<CommissionConfig> => {
  const db = await getDb();
  const rows = await db
    .select()
    .from(commissionConfig)
    .where(eq(commissionConfig.id, 1))
    .limit(1);
  if (rows[0]) return deepMerge(defaultCommissionConfig(), rows[0].data);
  const data = defaultCommissionConfig();
  await db.insert(commissionConfig).values({ id: 1, data }).onConflictDoNothing();
  return data;
});

export async function saveCommissionConfig(data: CommissionConfig): Promise<void> {
  const db = await getDb();
  await db
    .insert(commissionConfig)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: commissionConfig.id, set: { data, updatedAt: new Date() } });
  invalidateSingleton("commission-config");
}

/** Fresh (uncached) commission config for the SAVE/snapshot path — see `getAllowanceConfigFresh`. */
export function getCommissionConfigFresh(): Promise<CommissionConfig> {
  invalidateSingleton("commission-config");
  return getCommissionConfig();
}

export interface CommissionRunSummary {
  id: number;
  periodLabel: string;
  filename: string;
  createdAt: Date;
  rate: number;
  staffCount: number;
  totalCommission: number;
  qualifying: number;
}

export async function listCommissionRuns(): Promise<CommissionRunSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: commissionRuns.id,
      periodLabel: commissionRuns.periodLabel,
      filename: commissionRuns.filename,
      createdAt: commissionRuns.createdAt,
      summary: commissionRuns.summary,
    })
    .from(commissionRuns)
    .orderBy(desc(commissionRuns.createdAt));
  return rows.map((r) => ({
    id: r.id,
    periodLabel: r.periodLabel,
    filename: r.filename,
    createdAt: r.createdAt,
    rate: r.summary.rate,
    staffCount: r.summary.staff.length,
    totalCommission: r.summary.totals.commission,
    qualifying: r.summary.registrations.qualifying,
  }));
}

export async function getCommissionRun(id: number): Promise<CommissionRunRecord | undefined> {
  const db = await getDb();
  const rows = await db.select().from(commissionRuns).where(eq(commissionRuns.id, id)).limit(1);
  return rows[0];
}

export async function createCommissionRun(input: {
  periodLabel: string;
  filename: string;
  salesRows: CommissionRow[];
  configSnapshot: CommissionConfig;
  summary: CommissionSummary;
}): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(commissionRuns)
    .values({
      periodLabel: input.periodLabel,
      filename: input.filename,
      salesRows: input.salesRows,
      configSnapshot: input.configSnapshot,
      summary: input.summary,
    })
    .returning({ id: commissionRuns.id });
  invalidateSingleton("commission-trend");
  return row.id;
}

export async function deleteCommissionRun(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(commissionRuns).where(eq(commissionRuns.id, id));
  invalidateSingleton("commission-trend");
}

export interface CommissionTrendData {
  periods: string[];
  totals: { period: string; commission: number; rate: number; qualifying: number }[];
  staff: { name: string; points: { period: string; commission: number }[] }[];
}

/** Company totals + per-staff commission across saved months, for the Trends page. */
// Cached: commission trend aggregation (reads every run). Invalidated on
// commission run create/delete; the TTL also bounds staleness for this view.
export const getCommissionTrendData = memoizedSingleton("commission-trend", _getCommissionTrendData);
async function _getCommissionTrendData(): Promise<CommissionTrendData> {
  const db = await getDb();
  const rows = await db
    .select({ periodLabel: commissionRuns.periodLabel, summary: commissionRuns.summary })
    .from(commissionRuns)
    .orderBy(commissionRuns.createdAt);

  const periods: string[] = [];
  const totalByPeriod = new Map<string, CommissionTrendData["totals"][number]>();
  const staffByName = new Map<string, Map<string, number>>();

  // Ordered asc by createdAt, so a later save of the same period label wins.
  for (const r of rows) {
    if (!periods.includes(r.periodLabel)) periods.push(r.periodLabel);
    totalByPeriod.set(r.periodLabel, {
      period: r.periodLabel,
      commission: r.summary.totals.commission,
      rate: r.summary.rate,
      qualifying: r.summary.registrations.qualifying,
    });
    for (const s of r.summary.staff) {
      const name = s.staffName || s.staffCode;
      const m = staffByName.get(name) ?? new Map<string, number>();
      m.set(r.periodLabel, s.commission);
      staffByName.set(name, m);
    }
  }

  return {
    periods,
    totals: periods.map((p) => totalByPeriod.get(p)!),
    staff: [...staffByName.entries()]
      .map(([name, m]) => ({
        name,
        points: [...m.entries()].map(([period, commission]) => ({ period, commission })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ── Coaching income (Optimum Fit) ─────────────────────────────────────────────

/** Read the singleton coaching-income rates, seeding spec defaults on first use. */
export const getTeachingConfig = memoizedSingleton("teaching-config", async (): Promise<TeachingConfig> => {
  const db = await getDb();
  const rows = await db.select().from(teachingConfig).where(eq(teachingConfig.id, 1)).limit(1);
  if (rows[0]) return deepMerge(defaultTeachingConfig(), rows[0].data);
  const data = defaultTeachingConfig();
  await db.insert(teachingConfig).values({ id: 1, data }).onConflictDoNothing();
  return data;
});

export async function saveTeachingConfig(data: TeachingConfig): Promise<void> {
  const db = await getDb();
  await db
    .insert(teachingConfig)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: teachingConfig.id, set: { data, updatedAt: new Date() } });
  invalidateSingleton("teaching-config");
}

/** Fresh (uncached) coaching-income config for the SAVE/snapshot path — see `getAllowanceConfigFresh`. */
export function getTeachingConfigFresh(): Promise<TeachingConfig> {
  invalidateSingleton("teaching-config");
  return getTeachingConfig();
}

// Saved coaching-income months (mirror of commission runs).

export interface TeachingRunSummary {
  id: number;
  periodLabel: string;
  filename: string;
  createdAt: Date;
  coachCount: number;
  ptIncome: number;
  groupIncome: number;
  totalIncome: number;
}

export async function listTeachingRuns(): Promise<TeachingRunSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: teachingRuns.id,
      periodLabel: teachingRuns.periodLabel,
      filename: teachingRuns.filename,
      createdAt: teachingRuns.createdAt,
      summary: teachingRuns.summary,
    })
    .from(teachingRuns)
    .orderBy(desc(teachingRuns.createdAt));
  return rows.map((r) => ({
    id: r.id,
    periodLabel: r.periodLabel,
    filename: r.filename,
    createdAt: r.createdAt,
    coachCount: r.summary.coaches.length,
    ptIncome: r.summary.totals.ptIncome,
    groupIncome: r.summary.totals.groupIncome,
    totalIncome: r.summary.totals.totalIncome,
  }));
}

export async function getTeachingRun(id: number): Promise<TeachingRunRecord | undefined> {
  const db = await getDb();
  const rows = await db.select().from(teachingRuns).where(eq(teachingRuns.id, id)).limit(1);
  return rows[0];
}

export async function createTeachingRun(input: {
  periodLabel: string;
  filename: string;
  sessionRows: TeachingRow[];
  configSnapshot: TeachingConfig;
  summary: TeachingSummary;
}): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(teachingRuns)
    .values({
      periodLabel: input.periodLabel,
      filename: input.filename,
      sessionRows: input.sessionRows,
      configSnapshot: input.configSnapshot,
      summary: input.summary,
    })
    .returning({ id: teachingRuns.id });
  invalidateSingleton("teaching-trend");
  return row.id;
}

export async function deleteTeachingRun(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(teachingRuns).where(eq(teachingRuns.id, id));
  invalidateSingleton("teaching-trend");
}

export interface TeachingTrendData {
  periods: string[];
  totals: { period: string; totalIncome: number; ptIncome: number; groupIncome: number }[];
  coaches: { name: string; points: { period: string; income: number }[] }[];
}

/** Company totals + per-coach income across saved coaching months, for Trends. */
// Cached: coaching-income trend aggregation (reads every run). Invalidated on
// teaching run create/delete; the TTL also bounds staleness for this view.
export const getTeachingTrendData = memoizedSingleton("teaching-trend", _getTeachingTrendData);
async function _getTeachingTrendData(): Promise<TeachingTrendData> {
  const db = await getDb();
  const rows = await db
    .select({ periodLabel: teachingRuns.periodLabel, summary: teachingRuns.summary })
    .from(teachingRuns)
    .orderBy(teachingRuns.createdAt);

  const periods: string[] = [];
  const totalByPeriod = new Map<string, TeachingTrendData["totals"][number]>();
  const coachByName = new Map<string, Map<string, number>>();

  // Ordered asc by createdAt, so a later save of the same period label wins.
  for (const r of rows) {
    if (!periods.includes(r.periodLabel)) periods.push(r.periodLabel);
    totalByPeriod.set(r.periodLabel, {
      period: r.periodLabel,
      totalIncome: r.summary.totals.totalIncome,
      ptIncome: r.summary.totals.ptIncome,
      groupIncome: r.summary.totals.groupIncome,
    });
    for (const c of r.summary.coaches) {
      const m = coachByName.get(c.staffName) ?? new Map<string, number>();
      m.set(r.periodLabel, c.totalIncome);
      coachByName.set(c.staffName, m);
    }
  }

  return {
    periods,
    totals: periods.map((p) => totalByPeriod.get(p)!),
    coaches: [...coachByName.entries()]
      .map(([name, m]) => ({
        name,
        points: [...m.entries()].map(([period, income]) => ({ period, income })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ── Gym staff roster (Optimum Fit) ────────────────────────────────────────────

export async function listGymStaff(): Promise<GymStaffRecord[]> {
  const db = await getDb();
  return db.select().from(gymStaff).orderBy(gymStaff.name);
}

export async function getGymStaffMember(id: number): Promise<GymStaffRecord | undefined> {
  const db = await getDb();
  const rows = await db.select().from(gymStaff).where(eq(gymStaff.id, id)).limit(1);
  return rows[0];
}

/**
 * One staff member's earnings across every saved month, assembled from History:
 * commission runs (matched by staff_code or name) + coaching runs (by name /
 * alias). Pure matching lives in lib/earnings/income (locked by income.test.ts).
 */
export async function getGymStaffEarnings(member: GymStaffRecord): Promise<StaffEarningsReport> {
  const db = await getDb();
  const [cRows, tRows] = await Promise.all([
    db
      .select({ periodLabel: commissionRuns.periodLabel, createdAt: commissionRuns.createdAt, summary: commissionRuns.summary })
      .from(commissionRuns),
    db
      .select({ periodLabel: teachingRuns.periodLabel, createdAt: teachingRuns.createdAt, summary: teachingRuns.summary })
      .from(teachingRuns),
  ]);
  return staffEarnings(
    matcherFor(member),
    cRows.map((r) => ({ periodLabel: r.periodLabel, createdAt: r.createdAt.getTime(), staff: r.summary.staff })),
    tRows.map((r) => ({ periodLabel: r.periodLabel, createdAt: r.createdAt.getTime(), coaches: r.summary.coaches })),
  );
}

export interface StaffMonthRecord extends StaffMonthDetail {
  period: string;
}

/**
 * One staff member's detail for a single saved month — the latest commission and
 * coaching run for that period label (later saves win), reduced to this person.
 */
export async function getGymStaffMonth(member: GymStaffRecord, period: string): Promise<StaffMonthRecord | undefined> {
  const db = await getDb();
  const [cRows, tRows] = await Promise.all([
    db
      .select({ summary: commissionRuns.summary })
      .from(commissionRuns)
      .where(eq(commissionRuns.periodLabel, period))
      .orderBy(desc(commissionRuns.createdAt))
      .limit(1),
    db
      .select({ summary: teachingRuns.summary })
      .from(teachingRuns)
      .where(eq(teachingRuns.periodLabel, period))
      .orderBy(desc(teachingRuns.createdAt))
      .limit(1),
  ]);
  const detail = extractStaffMonth(matcherFor(member), cRows[0]?.summary.staff ?? [], tRows[0]?.summary.coaches ?? []);
  if (!detail.commission && !detail.coaching) return undefined;
  return { period, ...detail };
}

/** People earning in saved months who match no roster member (coverage gap). */
export async function getUnmatchedEarners(): Promise<UnmatchedEarner[]> {
  const db = await getDb();
  const [roster, cRows, tRows] = await Promise.all([
    db.select({ name: gymStaff.name, staffCode: gymStaff.staffCode, aliases: gymStaff.aliases }).from(gymStaff),
    db
      .select({ periodLabel: commissionRuns.periodLabel, createdAt: commissionRuns.createdAt, summary: commissionRuns.summary })
      .from(commissionRuns),
    db
      .select({ periodLabel: teachingRuns.periodLabel, createdAt: teachingRuns.createdAt, summary: teachingRuns.summary })
      .from(teachingRuns),
  ]);
  return unmatchedEarners(
    roster,
    cRows.map((r) => ({ periodLabel: r.periodLabel, createdAt: r.createdAt.getTime(), staff: r.summary.staff })),
    tRows.map((r) => ({ periodLabel: r.periodLabel, createdAt: r.createdAt.getTime(), coaches: r.summary.coaches })),
  );
}

export async function createGymStaff(input: GymStaffInput): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(gymStaff)
    .values({
      name: input.name,
      staffCode: input.staffCode,
      position: input.position,
      employmentType: input.employmentType,
      email: input.email,
      phone: input.phone,
      aliases: input.aliases,
      active: input.active,
    })
    .returning({ id: gymStaff.id });
  return row.id;
}

export async function updateGymStaff(id: number, input: GymStaffInput): Promise<void> {
  const db = await getDb();
  await db
    .update(gymStaff)
    .set({
      name: input.name,
      staffCode: input.staffCode,
      position: input.position,
      employmentType: input.employmentType,
      email: input.email,
      phone: input.phone,
      aliases: input.aliases,
      active: input.active,
      updatedAt: new Date(),
    })
    .where(eq(gymStaff.id, id));
}

/**
 * Permanently remove a gym-staff profile and clean up its dependents in one
 * transaction (analogous to `deleteCoach`): unlink any login that pointed at this
 * member (`users.gymStaffId → null`) and delete their gym HR notes. Saved
 * commission/coaching run history and the audit log are intentionally kept.
 */
export async function deleteGymStaff(id: number): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ gymStaffId: null, updatedAt: new Date() })
      .where(eq(users.gymStaffId, id));
    await tx.delete(gymNotes).where(eq(gymNotes.gymStaffId, id));
    await tx.delete(gymStaff).where(eq(gymStaff.id, id));
  });
}

// ── Allowance ────────────────────────────────────────────────────────────────

/** Read the singleton allowance rate tables, seeding defaults on first use. */
export const getAllowanceConfig = memoizedSingleton("allowance-config", async (): Promise<AllowanceConfig> => {
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
    // Backfill center aliases for configs saved before they existed.
    if (!data.centerAliases || typeof data.centerAliases !== "object") {
      data.centerAliases = {};
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
  invalidateSingleton("allowance-config");
}

/**
 * Fresh (uncached) read of the allowance config: invalidate the per-process cache
 * first so the memoized getter re-hits the DB. The SAVE/snapshot path must build
 * its persisted `configSnapshot` (and recompute) from the live rates — on a
 * multi-instance deploy a 60s-stale cache could otherwise snapshot old rates.
 * View/read pages keep the cached `getAllowanceConfig`.
 */
export function getAllowanceConfigFresh(): Promise<AllowanceConfig> {
  invalidateSingleton("allowance-config");
  return getAllowanceConfig();
}

/**
 * Save the allowance rate tables while preserving the stored centers list.
 * Centers are managed via Staff -> Settings; the rates form must never overwrite
 * them, even if the payload carries a stale or empty `centers` array.
 */
export async function saveAllowanceRates(payload: AllowanceConfig): Promise<void> {
  invalidateSingleton("allowance-config"); // read-modify-write — never merge onto a stale cache
  const current = await getAllowanceConfig();
  // Centers AND their aliases are managed via Staff -> Settings; a rates save must
  // never overwrite either, even if the payload carries stale/empty values.
  await saveAllowanceConfig({
    ...payload,
    centers: current.centers,
    centerAliases: current.centerAliases,
  });
}

/** Trim, drop blanks, dedupe (order-preserving). */
function normalizeCenterList(centers: readonly unknown[]): string[] {
  return [...new Set(centers.map((c) => String(c).trim()).filter(Boolean))];
}

/** Clean an alias map: trim/dedupe each list, drop blanks, keep only known centers. */
function normalizeAliasMap(
  aliases: Record<string, unknown> | undefined,
  centers: string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!aliases || typeof aliases !== "object") return out;
  const keep = new Set(centers);
  for (const [code, list] of Object.entries(aliases)) {
    if (!keep.has(code) || !Array.isArray(list)) continue;
    const cleaned = [...new Set(list.map((a) => String(a).trim()).filter(Boolean))];
    if (cleaned.length > 0) out[code] = cleaned;
  }
  return out;
}

/**
 * Replace the centers list (and, when provided, the per-center alias map) while
 * preserving the allowance rate tables. Centers/aliases live under Staff; this
 * saver and `saveAllowanceRates` deliberately preserve each other's data so the
 * Staff page and the Allowance rates page never clobber one another.
 *
 * When `centerAliases` is omitted the stored aliases are preserved (callers that
 * only touch the centers list don't need to know about aliases). Alias entries
 * for centers that no longer exist are dropped.
 */
export async function saveCenters(
  centers: readonly unknown[],
  centerAliases?: Record<string, unknown>,
): Promise<void> {
  invalidateSingleton("allowance-config"); // read-modify-write — never merge onto a stale cache
  const normalized = normalizeCenterList(centers);
  const current = await getAllowanceConfig();
  const aliases = normalizeAliasMap(centerAliases ?? current.centerAliases, normalized);
  await saveAllowanceConfig({ ...current, centers: normalized, centerAliases: aliases });
}

/**
 * Resolve (or create) the coach profile an allowance record belongs to, and
 * remember the pay tier for next month. Returns the coach id. Mirrors the
 * matching in `upsertCoachesFromRun`, but only touches `allowanceTier`/`center`
 * — never the KPI carry-over fields (`lastAllowance` / `lastMgmtAssessment`).
 */
interface EnsureCoachOpts {
  coachId: number | null;
  canonicalName: string;
  center: string;
  tier: AllowanceTier;
}

/**
 * Executor-threaded core of `ensureCoachForAllowance`: the read + conditional
 * insert run on whatever `exec` is passed, so a caller can supply its open
 * transaction to make the whole resolve-or-create atomic (no duplicate profile
 * under two concurrent same-coach saves).
 */
async function ensureCoachForAllowanceWith(
  exec: DbOrTx,
  opts: EnsureCoachOpts,
): Promise<number> {
  const existing = await listCoachesWith(exec);
  const match =
    (opts.coachId ? existing.find((c) => c.id === opts.coachId) : undefined) ||
    existing.find((c) => c.canonicalName === opts.canonicalName);

  if (match) {
    await exec
      .update(coaches)
      .set({ allowanceTier: opts.tier, center: match.center || opts.center, updatedAt: new Date() })
      .where(eq(coaches.id, match.id));
    return match.id;
  }

  const [row] = await exec
    .insert(coaches)
    .values({ canonicalName: opts.canonicalName, center: opts.center, allowanceTier: opts.tier })
    .returning({ id: coaches.id });
  return row.id;
}

export async function ensureCoachForAllowance(opts: EnsureCoachOpts): Promise<number> {
  const db = await getDb();
  // Standalone callers get their own transaction so the read→write is atomic.
  return db.transaction((tx) => ensureCoachForAllowanceWith(tx, opts));
}

interface AllowanceRunData {
  periodLabel: string;
  input: AllowanceInput;
  result: AllowanceResult;
  configSnapshot: AllowanceConfig;
}

/**
 * Executor-threaded core of the allowance save: resolve-or-create the coach, then
 * upsert the one (periodLabel, canonicalName) record. Runs on whatever `exec` is
 * passed so a caller can thread its open transaction (e.g. the lock-gated path) to
 * make the whole read→write atomic. Returns the row id.
 *
 * The upsert relies on the UNIQUE index on (period_label, canonical_name): one
 * atomic statement replaces the old delete-then-insert, so re-saving the same
 * coach+month is idempotent and two concurrent saves can't leave a duplicate row.
 */
async function insertAllowanceRunWith(exec: DbOrTx, data: AllowanceRunData): Promise<number> {
  const coachId = await ensureCoachForAllowanceWith(exec, {
    coachId: data.input.coachId,
    canonicalName: data.input.name,
    center: data.input.center,
    tier: data.input.tier,
  });

  const values = {
    periodLabel: data.periodLabel,
    coachId,
    canonicalName: data.input.name,
    tier: data.input.tier,
    center: data.input.center,
    input: { ...data.input, coachId },
    result: data.result,
    configSnapshot: data.configSnapshot,
  };

  const [row] = await exec
    .insert(allowanceRuns)
    .values(values)
    .onConflictDoUpdate({
      target: [allowanceRuns.periodLabel, allowanceRuns.canonicalName],
      set: {
        coachId: values.coachId,
        tier: values.tier,
        center: values.center,
        input: values.input,
        result: values.result,
        configSnapshot: values.configSnapshot,
        // Keep `created_at` advancing on re-save: History orders by it and the
        // old delete-then-insert reset it on every save, so preserve that.
        createdAt: new Date(),
      },
    })
    .returning({ id: allowanceRuns.id });
  return row.id;
}

/**
 * Save one coach's month. One record per coach per period: any existing
 * (periodLabel, canonicalName) entry is replaced so re-saving is idempotent.
 * Does NOT gate on the period lock — callers that must respect locks should use
 * `createAllowanceRunIfUnlocked`.
 */
export async function createAllowanceRun(data: AllowanceRunData): Promise<number> {
  const db = await getDb();
  // One transaction so the resolve-coach and the upsert are atomic (two
  // concurrent saves of the same coach+period can't race the coach insert).
  const id = await db.transaction((tx) => insertAllowanceRunWith(tx, data));
  invalidateSingleton("allowance-trend");
  return id;
}

/** Sentinel the route maps to its existing 409 "month is locked" response. */
export type AllowanceRunLocked = { locked: true };
export type AllowanceRunSaved = { locked: false; id: number };

/**
 * Save one coach's month, but ONLY if the period isn't locked — checked atomically
 * with the write. Inside one transaction it takes a period-keyed advisory lock (the
 * same one `lockPeriod` takes), re-reads the lock row, and only then upserts, so a
 * concurrent `lockPeriod` can't slip in between the check and the insert (the TOCTOU
 * the standalone `isPeriodLocked` + `createAllowanceRun` pair had). If the month is
 * locked → return `{ locked: true }` and write nothing; otherwise do the upsert and
 * return `{ locked: false, id }`.
 */
export async function createAllowanceRunIfUnlocked(
  data: AllowanceRunData,
): Promise<AllowanceRunLocked | AllowanceRunSaved> {
  const db = await getDb();
  const result = await db.transaction(async (tx): Promise<AllowanceRunLocked | AllowanceRunSaved> => {
    // Serialize against a concurrent lockPeriod on this period (it takes the same
    // advisory lock). Held until commit, so the lock-existence check below and the
    // write are atomic w.r.t. locking even when no lock row exists yet.
    await lockPeriodAdvisory(tx, data.periodLabel);
    const locked = await tx
      .select({ periodLabel: allowancePeriodLocks.periodLabel })
      .from(allowancePeriodLocks)
      .where(eq(allowancePeriodLocks.periodLabel, data.periodLabel))
      .limit(1);
    if (locked.length > 0) return { locked: true };
    const id = await insertAllowanceRunWith(tx, data);
    return { locked: false, id };
  });
  if (!result.locked) invalidateSingleton("allowance-trend");
  return result;
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
// Cached: allowance trend aggregation. TTL-bounded (≤60s) — fine for an
// analytical view; the allowance history list itself is never cached.
export const getAllowanceTrendData = memoizedSingleton("allowance-trend", _getAllowanceTrendData);
async function _getAllowanceTrendData(): Promise<AllowanceTrendData> {
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
  invalidateSingleton("allowance-trend");
}

// ── Sequential-month guard + month relabel ──────────────────────────────────────

/** How many allowance rows are filed under `period`. */
export async function countAllowanceRunsForPeriod(period: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: allowanceRuns.id })
    .from(allowanceRuns)
    .where(eq(allowanceRuns.periodLabel, period));
  return rows.length;
}

/** True when any allowance row exists at all (used to exempt the very first month). */
export async function hasAnyAllowanceRuns(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select({ id: allowanceRuns.id }).from(allowanceRuns).limit(1);
  return rows.length > 0;
}

/** Distinct months that already have at least one allowance entry. */
export async function listAllowancePeriods(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ periodLabel: allowanceRuns.periodLabel }).from(allowanceRuns);
  return [...new Set(rows.map((r) => r.periodLabel))];
}

/**
 * Sequential-month guard ("防呆"): a brand-new month may only be keyed once the
 * previous calendar month already has at least one entry — so you can't key June
 * before May. Two carve-outs keep it from getting in the way:
 *   • a month that already has entries is always open (editing/adding is fine), and
 *   • the very first month on an empty database is allowed (you must start somewhere).
 * Back-filling a gap still works, because the gap's previous month exists.
 * Returns the previous period so callers can build a clear message. This is the
 * gate for *keying* (creating) entries only — the month-relabel tools below are a
 * deliberate escape hatch and are not constrained by it.
 */
export async function checkAllowancePeriodAllowed(
  period: string,
): Promise<{ allowed: boolean; previousPeriod: string }> {
  const prev = previousPeriod(period);
  if ((await countAllowanceRunsForPeriod(period)) > 0) return { allowed: true, previousPeriod: prev };
  if ((await countAllowanceRunsForPeriod(prev)) > 0) return { allowed: true, previousPeriod: prev };
  if (!(await hasAnyAllowanceRuns())) return { allowed: true, previousPeriod: prev };
  return { allowed: false, previousPeriod: prev };
}

/** Canonical names present in BOTH periods — i.e. who would clash on a move. */
export async function getAllowancePeriodClashes(from: string, to: string): Promise<string[]> {
  const db = await getDb();
  const [fromRows, toRows] = await Promise.all([
    db.select({ name: allowanceRuns.canonicalName }).from(allowanceRuns).where(eq(allowanceRuns.periodLabel, from)),
    db.select({ name: allowanceRuns.canonicalName }).from(allowanceRuns).where(eq(allowanceRuns.periodLabel, to)),
  ]);
  const toNames = new Set(toRows.map((r) => r.name));
  return [...new Set(fromRows.map((r) => r.name).filter((n) => toNames.has(n)))];
}

/**
 * Re-label a whole month: move every entry from `from` to `to` — but only if NO
 * staff member already has an entry in `to`. If any would clash, the whole move is
 * blocked (nothing changes) and the clashing names are returned so the caller can
 * report them. This is the "block & report" rule: never overwrite, never do a
 * partial move.
 */
export async function moveAllowancePeriod(
  from: string,
  to: string,
): Promise<{ moved: number; clashes: string[] }> {
  const clashes = await getAllowancePeriodClashes(from, to);
  if (clashes.length > 0) return { moved: 0, clashes };
  const db = await getDb();
  const moved = await countAllowanceRunsForPeriod(from);
  await db.update(allowanceRuns).set({ periodLabel: to }).where(eq(allowanceRuns.periodLabel, from));
  invalidateSingleton("allowance-trend");
  return { moved, clashes: [] };
}

/**
 * Change one entry's month. Refuses (returns `clash`) when that staff member
 * already has an entry in the target month, so nothing is overwritten.
 */
export async function moveAllowanceRun(
  id: number,
  to: string,
): Promise<{ ok: true; from: string; name: string } | { ok: false; clash: true; name: string }> {
  const db = await getDb();
  const run = await getAllowanceRun(id);
  if (!run) throw new Error(`allowance run ${id} not found`);
  const existing = await db
    .select({ id: allowanceRuns.id })
    .from(allowanceRuns)
    .where(and(eq(allowanceRuns.periodLabel, to), eq(allowanceRuns.canonicalName, run.canonicalName)));
  if (existing.some((e) => e.id !== id)) return { ok: false, clash: true, name: run.canonicalName };
  await db.update(allowanceRuns).set({ periodLabel: to }).where(eq(allowanceRuns.id, id));
  invalidateSingleton("allowance-trend");
  return { ok: true, from: run.periodLabel, name: run.canonicalName };
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
  // Take the same period-keyed advisory lock createAllowanceRunIfUnlocked uses, so
  // a save in-flight for this period either commits before we mark it locked or
  // blocks until we do — it can never land a record in a now-locked month.
  await db.transaction(async (tx) => {
    await lockPeriodAdvisory(tx, period);
    await tx
      .insert(allowancePeriodLocks)
      .values({ periodLabel: period, lockedBy })
      .onConflictDoUpdate({
        target: allowancePeriodLocks.periodLabel,
        set: { lockedBy, lockedAt: new Date() },
      });
  });
}

/** Re-open a month. No-op if it wasn't locked. */
export async function unlockPeriod(period: string): Promise<void> {
  const db = await getDb();
  await db.delete(allowancePeriodLocks).where(eq(allowancePeriodLocks.periodLabel, period));
}

/** Live map of user id → display name (falling back to email when unset). */
async function displayNamesByUserId(): Promise<Map<number, string>> {
  const db = await getDb();
  const rows = await db.select({ id: users.id, displayName: users.displayName, email: users.email }).from(users);
  const map = new Map<number, string>();
  for (const r of rows) map.set(r.id, r.displayName.trim() || r.email);
  return map;
}

/**
 * Map of audit entityId → the name of whoever last did `action` on it, resolving
 * the actor to their current display name (falling back to the snapshotted
 * email). Powers the saved-by / edited-by attribution shown to admins. Only
 * covers actions recorded since the audit log existed; older rows map to nothing.
 */
async function saversFromAudit(entity: string, action: string): Promise<Record<number, string>> {
  const db = await getDb();
  const [rows, names] = await Promise.all([
    db
      .select({ entityId: auditLog.entityId, actorId: auditLog.actorId, actorEmail: auditLog.actorEmail })
      .from(auditLog)
      .where(and(eq(auditLog.entity, entity), eq(auditLog.action, action)))
      .orderBy(auditLog.createdAt, auditLog.id),
    displayNamesByUserId(),
  ]);
  const byEntity: Record<number, string> = {};
  for (const r of rows) {
    const id = Number(r.entityId);
    if (!Number.isFinite(id)) continue;
    const name = (r.actorId != null ? names.get(r.actorId) : undefined) || r.actorEmail;
    if (name) byEntity[id] = name; // ascending ⇒ latest wins
  }
  return byEntity;
}

/** allowance-run id → last saver's name, for the allowance history attribution. */
export function getAllowanceSavers(): Promise<Record<number, string>> {
  return saversFromAudit("allowance_run", "allowance.save");
}

/** KPI-run id → last saver's name, for the KPI history attribution. */
export function getKpiRunSavers(): Promise<Record<number, string>> {
  return saversFromAudit("run", "kpi_run.save");
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
  displayName?: string;
  coachId?: number | null;
  gymStaffId?: number | null;
  visibleCategories?: ToolCategory[];
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
      displayName: input.displayName?.trim() ?? "",
      passwordHash: hashPassword(input.password),
      role: input.role,
      coachId: input.coachId ?? null,
      gymStaffId: input.gymStaffId ?? null,
      // Omitted → column default (all categories).
      ...(input.visibleCategories !== undefined
        ? { visibleCategories: input.visibleCategories }
        : {}),
    })
    .returning();
  return row;
}

export async function updateUser(
  id: number,
  patch: {
    email?: string;
    displayName?: string;
    role?: Role;
    active?: boolean;
    coachId?: number | null;
    gymStaffId?: number | null;
    visibleCategories?: ToolCategory[];
    password?: string;
  },
): Promise<void> {
  const db = await getDb();
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) set.displayName = patch.displayName.trim();
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
  if (patch.gymStaffId !== undefined) set.gymStaffId = patch.gymStaffId;
  if (patch.visibleCategories !== undefined) set.visibleCategories = patch.visibleCategories;
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
/**
 * Capabilities introduced after a permission_config row may already have been
 * written are backfilled to the roles that hold them by default. Safe because a
 * brand-new capability can't have been intentionally revoked. Extend when adding
 * default-granted capabilities that must reach existing deployments.
 */
const BACKFILL_CAPS: Capability[] = ["finalize_kpi"];

export function normalizePermissionConfig(data: PermissionConfig): PermissionConfig {
  const out: PermissionConfig = { ...data };
  for (const role of CONFIGURABLE_ROLES) {
    if (!Array.isArray(out[role])) out[role] = [...DEFAULT_PERMISSION_CONFIG[role]];
    for (const cap of BACKFILL_CAPS) {
      if (DEFAULT_PERMISSION_CONFIG[role].includes(cap) && !out[role].includes(cap)) {
        out[role] = [...out[role], cap];
      }
    }
  }
  return out;
}

/** Read the singleton permission matrix, seeding defaults on first use. */
export const getPermissionConfig = memoizedSingleton("permission-config", async (): Promise<PermissionConfig> => {
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
  invalidateSingleton("permission-config");
}

// ── Instructor assessments (observation form) ────────────────────────────────

export async function listAssessmentsForCoach(coachId: number): Promise<AssessmentRecord[]> {
  const db = await getDb();
  return db
    .select()
    .from(assessments)
    .where(eq(assessments.coachId, coachId))
    .orderBy(desc(assessments.observedOn));
}

export async function getAssessment(id: number): Promise<AssessmentRecord | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(assessments).where(eq(assessments.id, id)).limit(1);
  return row;
}

export async function createAssessment(input: {
  coachId: number;
  observedOn: Date;
  assessor: string;
  classType: string;
  poolType: string;
  pax: number | null;
  levels: string[];
  hasHelper: boolean;
  ratings: RatingMap;
  totalPercent: number;
  finalGrade: GradeKey;
  comments: string;
}): Promise<AssessmentRecord> {
  const db = await getDb();
  const [row] = await db.insert(assessments).values(input).returning();
  return row;
}

export async function deleteAssessment(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(assessments).where(eq(assessments.id, id));
}

/** Latest assessment final % (0–100) per coach, for prefilling the KPI mgmt assessment. */
export async function getLatestAssessmentFinalByCoach(): Promise<Map<number, number>> {
  const db = await getDb();
  const rows = await db
    .select({ coachId: assessments.coachId, totalPercent: assessments.totalPercent })
    .from(assessments)
    .orderBy(desc(assessments.observedOn));
  const map = new Map<number, number>();
  for (const r of rows) {
    if (!map.has(r.coachId)) map.set(r.coachId, r.totalPercent); // desc ⇒ first seen is latest
  }
  return map;
}

export interface RecentAssessment {
  id: number;
  coachId: number;
  coachName: string;
  observedOn: Date;
  assessor: string;
  classType: string;
  poolType: string;
  totalPercent: number;
  finalGrade: GradeKey;
}

/** The most recent assessments across all instructors, with the coach name joined. */
export async function listRecentAssessments(limit = 20): Promise<RecentAssessment[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: assessments.id,
      coachId: assessments.coachId,
      coachName: coaches.canonicalName,
      observedOn: assessments.observedOn,
      assessor: assessments.assessor,
      classType: assessments.classType,
      poolType: assessments.poolType,
      totalPercent: assessments.totalPercent,
      finalGrade: assessments.finalGrade,
    })
    .from(assessments)
    .leftJoin(coaches, eq(assessments.coachId, coaches.id))
    .orderBy(desc(assessments.observedOn))
    .limit(limit);
  return rows.map((r) => ({ ...r, coachName: r.coachName ?? `#${r.coachId}` }));
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

export async function listGymNotes(gymStaffId: number): Promise<GymNoteRecord[]> {
  const db = await getDb();
  return db.select().from(gymNotes).where(eq(gymNotes.gymStaffId, gymStaffId)).orderBy(desc(gymNotes.noteDate));
}

export async function createGymNote(input: {
  gymStaffId: number;
  noteDate: Date;
  type: NoteType;
  title: string;
  body: string;
  severity: NoteSeverity | null;
  followUp: boolean;
  authoredBy: string;
}): Promise<GymNoteRecord> {
  const db = await getDb();
  const [row] = await db.insert(gymNotes).values(input).returning();
  return row;
}

export async function deleteGymNote(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(gymNotes).where(eq(gymNotes.id, id));
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
