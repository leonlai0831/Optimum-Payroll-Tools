import { cache } from "react";
import { and, asc, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { getDb, type DB } from "./index";
import { logger } from "@/lib/log";
import {
  allowanceConfig,
  allowancePeriodLocks,
  allowanceRuns,
  appErrors,
  assessments,
  freelancerConfig,
  freelancerRuns,
  auditLog,
  coaches,
  commissionConfig,
  commissionRuns,
  teachingConfig,
  teachingRuns,
  gymNotes,
  gymStaff,
  config,
  kpiIngests,
  lessonPlans,
  notes,
  permissionConfig,
  runs,
  users,
  timesheets,
  freelancerSchedules,
  type AllowancePeriodLockRecord,
  type AllowanceRunRecord,
  type AppErrorRecord,
  type AssessmentRecord,
  type AuditLogRecord,
  type CoachRecord,
  type CommissionRunRecord,
  type FreelancerRunRecord,
  type GymNoteRecord,
  type GymStaffRecord,
  type KpiIngestRecord,
  type LessonPlanRecord,
  type TeachingRunRecord,
  type NoteRecord,
  type RunRecord,
  type UserRecord,
  type TimesheetRecord,
  type FreelancerScheduleRecord,
} from "./schema";
import { hashPassword } from "@/lib/auth/password";
import {
  ALL_TOOL_CATEGORIES,
  CAPABILITIES,
  CONFIGURABLE_ROLES,
  DEFAULT_PERMISSION_CONFIG,
  LEGACY_CAPABILITY_MAP,
  sanitizeToolCategories,
  type Capability,
  type ConfigurableRole,
  type LegacyPermissionConfig,
  type PermissionConfig,
  type Role,
  type ToolCategory,
} from "@/lib/auth/types";
import type { TimesheetClassType, TimesheetEntryType } from "@/lib/timesheet/types";
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
import { findAliasConflict, type AliasConflict } from "@/lib/kpi/alias-conflicts";
import { defaultCommissionConfig } from "@/lib/commission/defaults";
import type { CommissionConfig, CommissionRow, CommissionSummary } from "@/lib/commission/types";
import { defaultTeachingConfig } from "@/lib/teaching/defaults";
import type { TeachingConfig, TeachingRow, TeachingSummary } from "@/lib/teaching/types";
import type { GymStaffInput } from "@/lib/gym/types";
import type {
  LessonPlanData,
  LessonPlanStatus,
  LessonPlanType,
  LevelType,
  SelfEvalAnswer,
} from "@/lib/lesson-plan/types";
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
  type TeachingHoursRow,
} from "@/lib/allowance/types";
import { aggregateTeaching } from "@/lib/timesheet/aggregate";
import { reconcileFreelancer, type ReconcileResult } from "@/lib/timesheet/reconcile";
import { previousPeriod } from "@/lib/allowance/period";
import { DEFAULT_FREELANCER_CONFIG } from "@/lib/freelancer/defaults";
import {
  positionGroupOf,
  type FreelancerConfig,
  type FreelancerInput,
  type FreelancerPosition,
  type FreelancerResult,
} from "@/lib/freelancer/types";
import { jobRoleForTier } from "@/lib/allowance/tier-rules";
import { calcAllowance } from "@/lib/allowance/calc";
import { extractCenterHours, mergeBulkRow } from "@/lib/allowance/bulk";
import { makeCenterNormalizer } from "@/lib/allowance/centers";

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

/**
 * Namespace prefix for the KPI period advisory lock, kept distinct from the
 * allowance lock (which keys on the bare period) so the two modules never
 * serialize against each other on the same period string. Every path that can
 * OPEN or CLOSE a KPI period — staging a delivery, finalizing/importing a run —
 * takes `lockPeriodAdvisory(tx, KPI_PERIOD_LOCK_NS + period)`, so the staging
 * close-check and a concurrent finalize/import are mutually exclusive.
 */
const KPI_PERIOD_LOCK_NS = "kpi:";

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
  const db = await getDb();
  // The runs scan and the allowance history don't depend on the coach row, so
  // fetch all three in parallel and bail afterwards if the coach doesn't exist.
  const [coach, runRows, allowanceRows] = await Promise.all([
    getCoach(coachId),
    db
      .select({ periodLabel: runs.periodLabel, coachResults: runs.coachResults })
      .from(runs)
      .orderBy(runs.createdAt),
    listAllowanceRuns(),
  ]);
  if (!coach) return null;

  const names = new Set([coach.canonicalName, ...(coach.aliases ?? [])]);
  // Ordered asc by createdAt: when the same period label was saved twice, the
  // LATER save overwrites the earlier point — one point per period, never
  // duplicates (mirrors the commission/teaching trend builders).
  const kpiByPeriod = new Map<string, CoachKpiPoint>();
  for (const r of runRows) {
    const rc = r.coachResults.find(
      (c) =>
        c.coachId === coachId ||
        c.canonicalName === coach.canonicalName ||
        c.accounts.some((a) => names.has(a)),
    );
    if (rc) {
      kpiByPeriod.set(r.periodLabel, {
        period: r.periodLabel,
        finalScore: rc.finalScore,
        grade: rc.grade,
        payout: rc.payout,
        students: rc.students,
      });
    }
  }
  const kpi = [...kpiByPeriod.values()];

  const allowance = allowanceRows.filter(
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
      | "canonicalName"
      | "center"
      | "allowanceTier"
      | "active"
      | "jobRole"
      | "employmentType"
      | "icNo"
      | "bankName"
      | "bankAccount"
    >
  >,
): Promise<void> {
  const db = await getDb();
  await db
    .update(coaches)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(coaches.id, id));
}

/**
 * Bulk payee-details save (Workforce → Payees): one transaction, one SELECT for
 * all target rows + one UPDATE per changed row — instead of the previous
 * per-row getCoach/updateCoach pairs (2N sequential round-trips on Neon) with
 * no atomicity (a mid-loop failure left a partially-applied save and skipped
 * the audit). Field semantics mirror the single-profile PATCH: a string value
 * is trimmed, "" clears; a missing field keeps the stored value. Freelancers
 * only. Returns the canonical names actually updated.
 */
export async function bulkUpdatePayeeDetails(
  rows: { id: number; icNo?: string; bankName?: string; bankAccount?: string }[],
): Promise<string[]> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];
    const existing = await tx.select().from(coaches).where(inArray(coaches.id, ids));
    const byId = new Map(existing.map((c) => [c.id, c]));
    const saved: string[] = [];
    for (const row of rows) {
      const coach = byId.get(row.id);
      // This surface manages freelancer payout details only.
      if (!coach || coach.employmentType !== "freelancer") continue;
      await tx
        .update(coaches)
        .set({
          icNo: typeof row.icNo === "string" ? row.icNo.trim() || null : coach.icNo,
          bankName: typeof row.bankName === "string" ? row.bankName.trim() || null : coach.bankName,
          bankAccount:
            typeof row.bankAccount === "string"
              ? row.bankAccount.trim() || null
              : coach.bankAccount,
          updatedAt: new Date(),
        })
        .where(eq(coaches.id, coach.id));
      saved.push(coach.canonicalName);
    }
    return saved;
  });
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
 * Duplicate-alias guard for the KPI link editor: the first submitted alias
 * already claimed by a DIFFERENT coach (alias or canonical name), or null when
 * all are free. Checked before `updateCoachAliases` so one account can never
 * end up on two profiles (the "ARIF - LMY [PK]" history-fork incident).
 */
export async function findCoachAliasConflict(
  coachId: number,
  aliases: string[],
): Promise<AliasConflict | null> {
  const all = await listCoaches();
  return findAliasConflict(
    coachId,
    aliases,
    all.map((c) => ({ id: c.id, canonicalName: c.canonicalName, aliases: c.aliases ?? [] })),
  );
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

/** Outcome of {@link mergeCoaches}, for the audit line + UI toast. */
export interface MergeCoachesResult {
  survivorName: string;
  duplicateName: string;
  movedAllowanceRuns: number;
  /**
   * Allowance periods where BOTH profiles already had a saved record — the
   * (period, canonical_name) unique index forbids renaming those onto the
   * survivor, so they keep the duplicate's name (still re-pointed by coachId,
   * so they show on the survivor's profile). Reported for the operator to
   * reconcile by hand.
   */
  conflictingPeriods: string[];
}

/**
 * Merge a duplicate staff profile into a survivor, in one transaction.
 * Fixes the "same person, two profiles" split that happens when a KPI upload
 * auto-creates a coach under a cleaned CSV name (e.g. "ARIF") while the person
 * already exists under their full name (e.g. "ARIF FARHAN"):
 *
 * - the duplicate's canonical name + aliases become aliases of the survivor,
 *   so future uploads AND the KPI history matcher resolve to the survivor
 *   (saved runs' jsonb is matched by name set — nothing to rewrite there);
 * - assessments, notes, and login links are re-pointed;
 * - allowance history is re-pointed and renamed onto the survivor where the
 *   period doesn't collide (see {@link MergeCoachesResult.conflictingPeriods});
 * - profile fields the survivor lacks (tier, allowance, center) carry over,
 *   and the newer management assessment of the two wins;
 * - the duplicate profile row is deleted.
 */
export async function mergeCoaches(
  survivorId: number,
  duplicateId: number,
): Promise<MergeCoachesResult> {
  if (survivorId === duplicateId) throw new Error("Pick two different employees.");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(coaches)
      .where(inArray(coaches.id, [survivorId, duplicateId]));
    const survivor = rows.find((r) => r.id === survivorId);
    const dup = rows.find((r) => r.id === duplicateId);
    if (!survivor || !dup) throw new Error("Employee not found.");

    // The duplicate's identity becomes part of the survivor's alias set.
    const aliases = [
      ...new Set([...survivor.aliases, ...dup.aliases, dup.canonicalName]),
    ].sort();
    // The newer management assessment of the two wins.
    const mgmtUpdate =
      dup.lastMgmtAssessmentAt &&
      (!survivor.lastMgmtAssessmentAt || dup.lastMgmtAssessmentAt > survivor.lastMgmtAssessmentAt)
        ? {
            lastMgmtAssessment: dup.lastMgmtAssessment,
            lastMgmtAssessmentAt: dup.lastMgmtAssessmentAt,
          }
        : {};
    await tx
      .update(coaches)
      .set({
        aliases,
        center: survivor.center || dup.center,
        allowanceTier: survivor.allowanceTier ?? dup.allowanceTier,
        lastAllowance: survivor.lastAllowance ?? dup.lastAllowance,
        active: survivor.active || dup.active,
        ...mgmtUpdate,
        updatedAt: new Date(),
      })
      .where(eq(coaches.id, survivorId));

    // Re-point dependents (no DB-level FKs — cascade by hand, like deleteCoach).
    await tx
      .update(assessments)
      .set({ coachId: survivorId })
      .where(eq(assessments.coachId, duplicateId));
    await tx.update(notes).set({ coachId: survivorId }).where(eq(notes.coachId, duplicateId));
    await tx
      .update(users)
      .set({ coachId: survivorId, updatedAt: new Date() })
      .where(eq(users.coachId, duplicateId));

    // Allowance history: rename onto the survivor where the period is free;
    // colliding periods only get re-pointed (the unique index forbids the rename).
    const survivorPeriods = new Set(
      (
        await tx
          .select({ periodLabel: allowanceRuns.periodLabel })
          .from(allowanceRuns)
          .where(
            or(
              eq(allowanceRuns.coachId, survivorId),
              eq(allowanceRuns.canonicalName, survivor.canonicalName),
            ),
          )
      ).map((r) => r.periodLabel),
    );
    const dupRuns = await tx
      .select({ id: allowanceRuns.id, periodLabel: allowanceRuns.periodLabel })
      .from(allowanceRuns)
      .where(
        or(
          eq(allowanceRuns.coachId, duplicateId),
          eq(allowanceRuns.canonicalName, dup.canonicalName),
        ),
      );
    const movable = dupRuns.filter((r) => !survivorPeriods.has(r.periodLabel));
    const conflicting = dupRuns.filter((r) => survivorPeriods.has(r.periodLabel));
    if (movable.length > 0) {
      await tx
        .update(allowanceRuns)
        .set({
          coachId: survivorId,
          canonicalName: survivor.canonicalName,
          // Keep the snapshot input's display name in step with the rename.
          input: sql`jsonb_set(${allowanceRuns.input}, '{name}', to_jsonb(${survivor.canonicalName}::text))`,
        })
        .where(
          inArray(
            allowanceRuns.id,
            movable.map((r) => r.id),
          ),
        );
    }
    if (conflicting.length > 0) {
      await tx
        .update(allowanceRuns)
        .set({ coachId: survivorId })
        .where(
          inArray(
            allowanceRuns.id,
            conflicting.map((r) => r.id),
          ),
        );
    }

    await tx.delete(coaches).where(eq(coaches.id, duplicateId));

    return {
      survivorName: survivor.canonicalName,
      duplicateName: dup.canonicalName,
      movedAllowanceRuns: movable.length,
      conflictingPeriods: [...new Set(conflicting.map((r) => r.periodLabel))].sort(),
    };
  });
}

/**
 * Persist/refresh coach profiles from a finalized run: union aliases, remember
 * position, and carry forward the latest management assessment + allowance.
 */
export async function upsertCoachesFromRun(coachResults: RunCoach[]): Promise<void> {
  const db = await getDb();
  const normalizeCtr = await centerNormalizerFromConfig();
  // One transaction so the `listCoaches` read + conditional insert is atomic:
  // two concurrent finalized runs can't both miss the same coach and each insert
  // a duplicate profile.
  await db.transaction((tx) => upsertCoachesFromRunWith(tx, coachResults, normalizeCtr));
}

/**
 * Normalizer mapping raw CSV center labels onto the configured center codes
 * (Settings -> Centers aliases), e.g. "Subang USJ" -> "USJ". Fetched OUTSIDE any
 * transaction (memoized singleton) so the carry-over writes store codes, not the
 * raw spelling of whichever CSV happened to be uploaded.
 */
async function centerNormalizerFromConfig(): Promise<(raw: string) => string> {
  const cfg = await getAllowanceConfig();
  return makeCenterNormalizer(cfg.centers, cfg.centerAliases ?? {});
}

/**
 * Executor-threaded core of `upsertCoachesFromRun`, so a caller (e.g. `createRun`)
 * can run the run insert and the profile carry-over in ONE transaction.
 */
async function upsertCoachesFromRunWith(
  tx: Tx,
  coachResults: RunCoach[],
  normalizeCtr: (raw: string) => string,
): Promise<void> {
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
          center: normalizeCtr(rc.center) || match.center,
          defaultPosition: rc.position,
          lastAllowance: rc.teachingAllowance ?? match.lastAllowance,
          ...mgmtUpdate,
          updatedAt: new Date(),
        })
        .where(eq(coaches.id, match.id));
    } else {
      // onConflictDoNothing: the in-tx snapshot is the only thing telling us this
      // coach is new, but a concurrent finalized run can create the same
      // canonicalName between our snapshot and this insert. The unique index then
      // rejects the loser with a 500 that aborts an otherwise-valid month-save.
      // Skipping the insert on conflict keeps the winner's carry-over (these are
      // "last known" hints, overwritten next finalize) and lets the save commit.
      await tx
        .insert(coaches)
        .values({
          canonicalName: rc.canonicalName,
          aliases: mergedAliases,
          center: normalizeCtr(rc.center),
          defaultPosition: rc.position,
          lastAllowance: rc.teachingAllowance,
          lastMgmtAssessment: rc.mgmtAssessment ?? null,
          lastMgmtAssessmentAt: rc.mgmtAssessment != null ? new Date() : null,
        })
        .onConflictDoNothing({ target: coaches.canonicalName });
    }
  }
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
  const byCoach = new Map<string, Map<string, { score: number; payout: number }>>();
  // Ordered asc by createdAt, so when the same period label was saved twice the
  // LATER save wins per (period, coach) — one point each, never duplicates
  // (mirrors the commission/teaching trend builders).
  for (const r of rows) {
    if (!periods.includes(r.periodLabel)) periods.push(r.periodLabel);
    for (const c of r.coachResults) {
      const m = byCoach.get(c.canonicalName) ?? new Map<string, { score: number; payout: number }>();
      m.set(r.periodLabel, { score: c.finalScore, payout: c.payout });
      byCoach.set(c.canonicalName, m);
    }
  }
  return {
    periods,
    coaches: [...byCoach.entries()]
      .map(([name, m]) => ({
        name,
        points: [...m.entries()].map(([period, p]) => ({ period, ...p })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
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
  // One transaction: the run insert and the coach-profile carry-over commit (or
  // roll back) together, so a crash/retry between the two can't leave a saved
  // month whose profiles were never carried forward — or carried-forward
  // profiles for a month that was never saved.
  const normalizeCtr = await centerNormalizerFromConfig();
  const id = await db.transaction(async (tx) => {
    // Finalizing closes the period to KPI pushes; take the period lock first so a
    // concurrent ingest staging this same period serializes behind us and its
    // closed-period re-check sees this finalized run (createKpiIngestChecked).
    if (status === "finalized") {
      await lockPeriodAdvisory(tx, KPI_PERIOD_LOCK_NS + input.periodLabel);
    }
    const [row] = await tx
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
    if (status === "finalized") await upsertCoachesFromRunWith(tx, input.coachResults, normalizeCtr);
    return row.id;
  });
  invalidateSingleton("kpi-runs");
  invalidateSingleton("kpi-trend");
  return id;
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
  // Fetch the (memoized) center normalizer OUTSIDE the transaction, like createRun.
  const normalizeCtr = await centerNormalizerFromConfig();
  await db.transaction(async (tx) => {
    // Read the run's (immutable) period so we can take the KPI period lock when
    // finalizing — same lock the staging path takes, so a concurrent push can't
    // stage into the month this review is closing.
    const [run] = await tx
      .select({ periodLabel: runs.periodLabel })
      .from(runs)
      .where(eq(runs.id, id))
      .limit(1);
    if (!run) return;
    if (status === "finalized") {
      await lockPeriodAdvisory(tx, KPI_PERIOD_LOCK_NS + run.periodLabel);
    }
    await tx.update(runs).set({ coachResults, status }).where(eq(runs.id, id));
    // Carry profiles forward in the SAME transaction as the status flip, so a
    // crash between the two can't leave a finalized month whose carry-over
    // (allowance, mgmt-assessment age, aliases) was never written.
    if (status === "finalized") await upsertCoachesFromRunWith(tx, coachResults, normalizeCtr);
  });
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

// ── KPI ingests (machine-pushed monthly data, staged for review) ─────────────

export type KpiIngestStatus = KpiIngestRecord["status"];
export type KpiIngestSource = KpiIngestRecord["source"];

/** List-page projection: everything except the (potentially large) rows blob. */
export interface KpiIngestSummary {
  id: number;
  periodLabel: string;
  label: string;
  status: KpiIngestStatus;
  source: KpiIngestSource;
  rowCount: number;
  importedRunId: number | null;
  importedAt: Date | null;
  receivedAt: Date;
}

/**
 * A period is CLOSED to machine pushes once payroll has acted on it: a
 * FINALIZED run exists for the periodLabel (draft runs do NOT block — the
 * month is still being worked), or any staged delivery for it was already
 * imported into a run. POST /api/ingest/kpi rejects a push for a closed
 * period with 409 before staging, superseding, or auditing anything; the
 * payroll admin reopens the month first if a correction is needed.
 */
async function isKpiPeriodClosedWith(exec: DbOrTx, periodLabel: string): Promise<boolean> {
  const finalized = await exec
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.periodLabel, periodLabel), eq(runs.status, "finalized")))
    .limit(1);
  if (finalized.length > 0) return true;
  const imported = await exec
    .select({ id: kpiIngests.id })
    .from(kpiIngests)
    .where(and(eq(kpiIngests.periodLabel, periodLabel), eq(kpiIngests.status, "imported")))
    .limit(1);
  return imported.length > 0;
}

export async function isKpiPeriodClosed(periodLabel: string): Promise<boolean> {
  return isKpiPeriodClosedWith(await getDb(), periodLabel);
}

/**
 * Stage a pushed delivery as pending. Rows must already be normalized
 * InstructorRow[]. A re-push for the same period is a correction: any still-
 * PENDING deliveries for that periodLabel are flipped to "superseded" (status
 * only — rows stay viewable forever, like discarded) in the SAME transaction as
 * the insert, each with its own `kpi_ingest.superseded` audit entry. Imported
 * and discarded deliveries are never touched.
 */
export interface CreateKpiIngestInput {
  periodLabel: string;
  label: string;
  rows: InstructorRow[];
  /** How the delivery arrived; pre-source rows were all machine pushes. */
  source?: KpiIngestSource;
  /** Audit attribution for the supersede entries (manual uploads name the user). */
  actor?: { id: number | null; email: string } | null;
}

/**
 * Stage a delivery WITHOUT a closed-period guard — the raw primitive. Callers
 * that must honor the closed-period invariant use `createKpiIngestChecked`; this
 * core exists so it can be threaded into that checked transaction (and so the
 * low-level supersede tests can stage into any period directly).
 */
async function createKpiIngestWith(
  tx: Tx,
  input: CreateKpiIngestInput,
): Promise<{ id: number; supersededIds: number[] }> {
  {
    // Flip BEFORE the insert so the new (pending) row can't match its own filter.
    const superseded = await tx
      .update(kpiIngests)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(and(eq(kpiIngests.periodLabel, input.periodLabel), eq(kpiIngests.status, "pending")))
      .returning({ id: kpiIngests.id });
    const supersededIds = superseded.map((s) => s.id).sort((a, b) => a - b);

    const [row] = await tx
      .insert(kpiIngests)
      .values({
        periodLabel: input.periodLabel,
        label: input.label,
        rows: input.rows,
        source: input.source ?? "api",
      })
      .returning({ id: kpiIngests.id });

    // Audit inside the transaction: a supersede and its trail commit (or roll
    // back) together — unlike recordAudit, which is fire-and-forget by design.
    if (supersededIds.length > 0) {
      await tx.insert(auditLog).values(
        supersededIds.map((oldId) => ({
          actorId: input.actor?.id ?? null,
          actorEmail: input.actor?.email ?? "ingest-api",
          action: "kpi_ingest.superseded",
          entity: "kpi_ingest",
          entityId: String(oldId),
          summary: `Superseded staged KPI delivery #${oldId} for ${input.periodLabel} by newer push #${row.id}`,
        })),
      );
    }
    return { id: row.id, supersededIds };
  }
}

/** Public staging primitive: one transaction, no closed-period guard. */
export async function createKpiIngest(
  input: CreateKpiIngestInput,
): Promise<{ id: number; supersededIds: number[] }> {
  const db = await getDb();
  return db.transaction((tx) => createKpiIngestWith(tx, input));
}

/**
 * Stage a delivery while honoring the closed-period invariant ATOMICALLY: in one
 * transaction it takes the KPI period advisory lock, re-checks `isKpiPeriodClosed`
 * against committed state, and only then supersedes + inserts. Because every
 * closing path (a finalized `createRun`/`updateRunReview`, `importKpiIngest`)
 * acquires the same lock, a concurrent finalize/import can't slip in between the
 * check and the insert — closing the check-then-act race that a separate
 * `isKpiPeriodClosed()` call before `createKpiIngest()` left open. Returns
 * `{ closed: true }` (nothing staged) when the period closed under us.
 */
export async function createKpiIngestChecked(
  input: CreateKpiIngestInput,
): Promise<{ closed: true } | { closed: false; id: number; supersededIds: number[] }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await lockPeriodAdvisory(tx, KPI_PERIOD_LOCK_NS + input.periodLabel);
    if (await isKpiPeriodClosedWith(tx, input.periodLabel)) return { closed: true };
    const { id, supersededIds } = await createKpiIngestWith(tx, input);
    return { closed: false, id, supersededIds };
  });
}

/** ALL deliveries, newest first — discarded and imported ones stay listed forever. */
export async function listKpiIngests(): Promise<KpiIngestSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: kpiIngests.id,
      periodLabel: kpiIngests.periodLabel,
      label: kpiIngests.label,
      status: kpiIngests.status,
      source: kpiIngests.source,
      // Defensive: jsonb_array_length THROWS on a non-array, which would 500
      // the whole Uploads page over one malformed delivery — guard with
      // jsonb_typeof so a bad row renders as "0 rows" instead.
      rowCount:
        sql<number>`case when jsonb_typeof(${kpiIngests.rows}) = 'array' then jsonb_array_length(${kpiIngests.rows}) else 0 end`.mapWith(
          Number,
        ),
      importedRunId: kpiIngests.importedRunId,
      importedAt: kpiIngests.importedAt,
      receivedAt: kpiIngests.receivedAt,
    })
    .from(kpiIngests)
    .orderBy(desc(kpiIngests.receivedAt), desc(kpiIngests.id));
  return rows;
}

/** Pending deliveries only (drives the dashboard's "Pending uploads" card). */
export async function listPendingKpiIngests(): Promise<KpiIngestSummary[]> {
  return (await listKpiIngests()).filter((i) => i.status === "pending");
}

export async function getKpiIngest(id: number): Promise<KpiIngestRecord | undefined> {
  const db = await getDb();
  const rows = await db.select().from(kpiIngests).where(eq(kpiIngests.id, id)).limit(1);
  return rows[0];
}

/**
 * Replace a delivery's rows (owner edits). Allowed for pending, imported AND
 * discarded deliveries — the monthly database record stays correctable. Note an
 * imported delivery's edits never touch the saved run (it snapshotted the rows
 * at import time). Only a SUPERSEDED delivery is read-only: a newer push
 * replaced it, so the newer delivery is the one to correct. Returns false —
 * and writes nothing — for superseded (or missing) deliveries.
 */
export async function updateKpiIngestRows(id: number, rows: InstructorRow[]): Promise<boolean> {
  const db = await getDb();
  const updated = await db
    .update(kpiIngests)
    .set({ rows, updatedAt: new Date() })
    .where(and(eq(kpiIngests.id, id), ne(kpiIngests.status, "superseded")))
    .returning({ id: kpiIngests.id });
  return updated.length > 0;
}

/** Discard a pending delivery (status flip — never a hard delete). False if not pending. */
export async function discardKpiIngest(id: number): Promise<boolean> {
  const db = await getDb();
  const updated = await db
    .update(kpiIngests)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(and(eq(kpiIngests.id, id), eq(kpiIngests.status, "pending")))
    .returning({ id: kpiIngests.id });
  return updated.length > 0;
}

/**
 * Mark a pending delivery imported into a saved run. Validates the ingest exists
 * AND is still pending; anything else is a silent no-op (returns false) so a
 * stale/duplicate `ingestId` on a run save can never break the save itself.
 */
export async function importKpiIngest(id: number, runId: number): Promise<boolean> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    // Importing closes the period; serialize with the staging path on the same
    // lock so a concurrent push can't stage after this flip commits. Read the
    // (immutable) period first to key the lock; a missing ingest is a no-op.
    const [ingest] = await tx
      .select({ periodLabel: kpiIngests.periodLabel })
      .from(kpiIngests)
      .where(eq(kpiIngests.id, id))
      .limit(1);
    if (!ingest) return false;
    await lockPeriodAdvisory(tx, KPI_PERIOD_LOCK_NS + ingest.periodLabel);
    const updated = await tx
      .update(kpiIngests)
      .set({ status: "imported", importedRunId: runId, importedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(kpiIngests.id, id), eq(kpiIngests.status, "pending")))
      .returning({ id: kpiIngests.id });
    return updated.length > 0;
  });
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

  // onConflictDoUpdate resolves the read→insert race: if a concurrent path
  // created this coach after our snapshot, the unique index would otherwise 500
  // the loser and abort the allowance save. On conflict we apply this call's
  // tier (mirroring the match branch) and return the existing id — center is
  // left untouched so a concurrent writer's center isn't clobbered.
  const [row] = await exec
    .insert(coaches)
    .values({ canonicalName: opts.canonicalName, center: opts.center, allowanceTier: opts.tier })
    .onConflictDoUpdate({
      target: coaches.canonicalName,
      set: { allowanceTier: opts.tier, updatedAt: new Date() },
    })
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
  /**
   * Set by the bulk-by-center entry screen: this save edits ONLY this center's
   * teaching hours (plus the staff-level attendance fields/tier). When set and a
   * record already exists for (periodLabel, name), the stored record is re-read
   * inside the save transaction and only this center's slice is replaced — so a
   * bulk save merged client-side against a stale snapshot can't wipe hours
   * another manager saved for a different center in the meantime. Whole-record
   * saves (the single-coach calculator) leave it unset and replace as before.
   */
  mergeCenter?: string;
}

/**
 * Re-merge a bulk-by-center save against the STORED record (see
 * `AllowanceRunData.mergeCenter`): stored input is the base; only the merge
 * center's teaching row and the staff-level fields come from the incoming
 * input; `otherItems` stay as stored. The result is recomputed from the merged
 * input so the persisted breakdown always matches it. Callers serialize saves
 * per period via the advisory lock in `createAllowanceRunIfUnlocked`, so the
 * read here sees the latest committed record.
 */
async function withMergedCenterSlice(
  exec: DbOrTx,
  data: AllowanceRunData,
): Promise<AllowanceRunData> {
  const target = data.mergeCenter?.trim();
  if (!target) return data;
  const stored = await exec
    .select({ input: allowanceRuns.input })
    .from(allowanceRuns)
    .where(
      and(
        eq(allowanceRuns.periodLabel, data.periodLabel),
        eq(allowanceRuns.canonicalName, data.input.name),
      ),
    )
    .limit(1);
  if (!stored[0]) return data; // nothing saved yet — the incoming record stands
  const merged = mergeBulkRow(
    {
      coachId: data.input.coachId,
      name: data.input.name,
      tier: data.input.tier,
      center: target,
      opHours: data.input.opHours,
      leaveHours: data.input.leaveHours,
      ...extractCenterHours(data.input, target),
    },
    stored[0].input,
  );
  return { ...data, input: merged, result: calcAllowance(merged, data.configSnapshot) };
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
async function insertAllowanceRunWith(exec: DbOrTx, rawData: AllowanceRunData): Promise<number> {
  const data = await withMergedCenterSlice(exec, rawData);
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
  const [row] = await db
    .select({ n: count() })
    .from(allowanceRuns)
    .where(eq(allowanceRuns.periodLabel, period));
  return row.n;
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
  const rows = await db
    .selectDistinct({ periodLabel: allowanceRuns.periodLabel })
    .from(allowanceRuns);
  return rows.map((r) => r.periodLabel);
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
): Promise<{ moved: number; clashes: string[]; locked?: "from" | "to" }> {
  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    // Lock both periods (lowest key first → no deadlock) on the same advisory key
    // the save/lock paths use, so neither period can be locked, nor a record
    // saved into `to`, between these checks and the relabel — the route's
    // pre-checks are optimistic and racey on their own.
    const [a, b] = [from, to].sort();
    await lockPeriodAdvisory(tx, a);
    if (b !== a) await lockPeriodAdvisory(tx, b);

    // Authoritative lock re-check: refuse to move into or out of a locked month
    // (the relabel would mutate a closed month's totals, bypassing the lock).
    const lockedRows = await tx
      .select({ periodLabel: allowancePeriodLocks.periodLabel })
      .from(allowancePeriodLocks)
      .where(inArray(allowancePeriodLocks.periodLabel, [from, to]));
    const lockedSet = new Set(lockedRows.map((r) => r.periodLabel));
    if (lockedSet.has(from)) return { moved: 0, clashes: [], locked: "from" as const };
    if (lockedSet.has(to)) return { moved: 0, clashes: [], locked: "to" as const };

    // Clash re-check inside the tx (no TOCTOU vs a concurrent save into `to`).
    const fromRows = await tx
      .select({ name: allowanceRuns.canonicalName })
      .from(allowanceRuns)
      .where(eq(allowanceRuns.periodLabel, from));
    const toRows = await tx
      .select({ name: allowanceRuns.canonicalName })
      .from(allowanceRuns)
      .where(eq(allowanceRuns.periodLabel, to));
    const toNames = new Set(toRows.map((r) => r.name));
    const clashes = [...new Set(fromRows.map((r) => r.name).filter((n) => toNames.has(n)))];
    if (clashes.length > 0) return { moved: 0, clashes };

    await tx
      .update(allowanceRuns)
      .set({ periodLabel: to })
      .where(eq(allowanceRuns.periodLabel, from));
    return { moved: fromRows.length, clashes: [] as string[] };
  });
  if (result.moved > 0) invalidateSingleton("allowance-trend");
  return result;
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

// ── Freelancer payments ─────────────────────────────────────────────────────────

/** Read the singleton freelancer config, seeding defaults on first use. */
export const getFreelancerConfig = memoizedSingleton(
  "freelancer-config",
  async (): Promise<FreelancerConfig> => {
    const db = await getDb();
    const rows = await db
      .select()
      .from(freelancerConfig)
      .where(eq(freelancerConfig.id, 1))
      .limit(1);
    // Backfill-safe: keys added after a row was first written (e.g. a new
    // position's rate) gain their defaults; stored arrays/values win wholesale.
    if (rows[0]) return deepMerge(structuredClone(DEFAULT_FREELANCER_CONFIG), rows[0].data);
    const data = structuredClone(DEFAULT_FREELANCER_CONFIG);
    await db.insert(freelancerConfig).values({ id: 1, data }).onConflictDoNothing();
    return data;
  },
);

export async function saveFreelancerConfig(data: FreelancerConfig): Promise<void> {
  const db = await getDb();
  await db
    .insert(freelancerConfig)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: freelancerConfig.id, set: { data, updatedAt: new Date() } });
  invalidateSingleton("freelancer-config");
}

/**
 * Fresh (cache-bypassing) read of the freelancer config — the SAVE/snapshot path
 * must recompute and snapshot from the live rates, mirroring
 * `getAllowanceConfigFresh`. View/read pages keep the cached getter.
 */
export function getFreelancerConfigFresh(): Promise<FreelancerConfig> {
  invalidateSingleton("freelancer-config");
  return getFreelancerConfig();
}

interface FreelancerRunData {
  periodLabel: string;
  input: FreelancerInput;
  result: FreelancerResult;
  configSnapshot: FreelancerConfig;
}

/**
 * Resolve (or create) the coach profile a freelancer record belongs to, and
 * carry the position + payee details onto the profile for next month. The
 * freelancer position IS the allowance tier (`coaches.allowanceTier`); blank
 * payee fields never wipe a previously stored value. Runs on the caller's
 * transaction so resolve-or-create is atomic.
 */
async function ensureCoachForFreelancerWith(
  exec: DbOrTx,
  input: FreelancerInput,
): Promise<number> {
  const payee = {
    ...(input.icNo.trim() ? { icNo: input.icNo.trim() } : {}),
    ...(input.bankName.trim() ? { bankName: input.bankName.trim() } : {}),
    ...(input.bankAccount.trim() ? { bankAccount: input.bankAccount.trim() } : {}),
  };

  const existing = await listCoachesWith(exec);
  const match =
    (input.coachId ? existing.find((c) => c.id === input.coachId) : undefined) ||
    existing.find((c) => c.canonicalName === input.name);

  if (match) {
    // "CC" is freelancer-only — it is NOT an allowance tier, so it never
    // writes back onto the profile (the existing tier stays).
    const tier = input.position === "CC" ? {} : { allowanceTier: input.position };
    await exec
      .update(coaches)
      .set({ ...tier, ...payee, updatedAt: new Date() })
      .where(eq(coaches.id, match.id));
    return match.id;
  }

  // onConflictDoUpdate resolves the read→insert race (a concurrent save/import
  // creating the same canonicalName after our snapshot) instead of 500-ing the
  // loser. On conflict we apply the same fields the match branch would —
  // tier (never for CC) + payee — and leave employmentType/jobRole untouched.
  const [row] = await exec
    .insert(coaches)
    .values({
      canonicalName: input.name,
      employmentType: "freelancer",
      // CC has no allowance-tier equivalent: instructor role, tier unset.
      jobRole: input.position === "CC" ? "instructor" : jobRoleForTier(input.position),
      allowanceTier: input.position === "CC" ? null : input.position,
      ...payee,
    })
    .onConflictDoUpdate({
      target: coaches.canonicalName,
      set: {
        ...(input.position === "CC" ? {} : { allowanceTier: input.position }),
        ...payee,
        updatedAt: new Date(),
      },
    })
    .returning({ id: coaches.id });
  return row.id;
}

/**
 * Save one freelancer's month. Idempotent on (periodLabel, canonicalName) via the
 * unique index — re-saving replaces the record atomically — and the coach's
 * payee details carry over to the profile in the same transaction.
 */
export async function upsertFreelancerRun(data: FreelancerRunData): Promise<number> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const coachId = await ensureCoachForFreelancerWith(tx, data.input);
    const values = {
      periodLabel: data.periodLabel,
      coachId,
      canonicalName: data.input.name,
      input: { ...data.input, coachId },
      result: data.result,
      configSnapshot: data.configSnapshot,
      positionGroup: positionGroupOf(data.input.position),
      // Defaults to the payout month; an earlier month = a late submission.
      workPeriod: data.input.workPeriod || data.periodLabel,
    };
    const [row] = await tx
      .insert(freelancerRuns)
      .values(values)
      .onConflictDoUpdate({
        target: [
          freelancerRuns.periodLabel,
          freelancerRuns.canonicalName,
          freelancerRuns.positionGroup,
          freelancerRuns.workPeriod,
        ],
        set: {
          coachId: values.coachId,
          input: values.input,
          result: values.result,
          configSnapshot: values.configSnapshot,
          // Keep `created_at` advancing on re-save: History orders by it.
          createdAt: new Date(),
        },
      })
      .returning({ id: freelancerRuns.id });
    return row.id;
  });
}

export interface FreelancerRunSummary {
  id: number;
  periodLabel: string;
  coachId: number | null;
  canonicalName: string;
  position: FreelancerPosition;
  /** The month the work belongs to; differs from periodLabel on a late submission. */
  workPeriod: string;
  totalServiceHours: number;
  commitment: number;
  attendance: number;
  entityTotals: { entity: string; label: string; amount: number }[];
  grandTotal: number;
  createdAt: Date;
}

/** List freelancer records (optionally one month), newest first. */
export async function listFreelancerRuns(period?: string): Promise<FreelancerRunSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: freelancerRuns.id,
      periodLabel: freelancerRuns.periodLabel,
      coachId: freelancerRuns.coachId,
      canonicalName: freelancerRuns.canonicalName,
      input: freelancerRuns.input,
      workPeriod: freelancerRuns.workPeriod,
      result: freelancerRuns.result,
      createdAt: freelancerRuns.createdAt,
    })
    .from(freelancerRuns)
    .where(period ? eq(freelancerRuns.periodLabel, period) : undefined)
    .orderBy(desc(freelancerRuns.createdAt));
  return rows.map((r) => ({
    id: r.id,
    periodLabel: r.periodLabel,
    coachId: r.coachId,
    canonicalName: r.canonicalName,
    position: r.input.position,
    workPeriod: r.workPeriod ?? r.periodLabel,
    totalServiceHours: r.result.totalServiceHours,
    commitment: r.result.commitment,
    attendance: r.result.attendance,
    entityTotals: r.result.entityTotals,
    grandTotal: r.result.grandTotal,
    createdAt: r.createdAt,
  }));
}

/** Full saved records for one month — the bank-transfer export needs input + result. */
export async function getFreelancerRunsForPeriod(period: string): Promise<FreelancerRunRecord[]> {
  const db = await getDb();
  return db
    .select()
    .from(freelancerRuns)
    .where(eq(freelancerRuns.periodLabel, period))
    .orderBy(freelancerRuns.canonicalName);
}

export async function getFreelancerRun(id: number): Promise<FreelancerRunRecord | undefined> {
  const db = await getDb();
  const rows = await db.select().from(freelancerRuns).where(eq(freelancerRuns.id, id)).limit(1);
  return rows[0];
}

export async function deleteFreelancerRun(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(freelancerRuns).where(eq(freelancerRuns.id, id));
}

/** Distinct months that already have at least one freelancer entry. */
export async function listFreelancerPeriods(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ periodLabel: freelancerRuns.periodLabel })
    .from(freelancerRuns);
  return rows.map((r) => r.periodLabel).sort();
}

/**
 * Map of audit entityId → the name of whoever last did `action` on it, resolving
 * the actor to their current display name (falling back to the snapshotted
 * email). Powers the saved-by / edited-by attribution shown to admins. Only
 * covers actions recorded since the audit log existed; older rows map to nothing.
 *
 * One round-trip: `DISTINCT ON (entity_id)` keeps only the latest *named* audit
 * row per entity (matching the old "ascending ⇒ latest wins" fold), left-joined
 * to `users` for the actor's current display name → email → snapshot email.
 */
async function saversFromAudit(entity: string, action: string): Promise<Record<number, string>> {
  const db = await getDb();
  const name = sql<string>`coalesce(nullif(trim(${users.displayName}), ''), nullif(${users.email}, ''), nullif(${auditLog.actorEmail}, ''))`;
  const rows = await db
    .selectDistinctOn([auditLog.entityId], { entityId: auditLog.entityId, name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.entity, entity), eq(auditLog.action, action), sql`${name} is not null`))
    .orderBy(auditLog.entityId, desc(auditLog.createdAt), desc(auditLog.id));
  const byEntity: Record<number, string> = {};
  for (const r of rows) {
    const id = Number(r.entityId);
    if (!Number.isFinite(id)) continue;
    byEntity[id] = r.name;
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
  const [row] = await db.select({ n: count() }).from(users);
  return row.n;
}

export async function createUser(input: {
  email: string;
  password: string;
  role: Role;
  displayName?: string;
  /** Legal/full name (admin-only field). Empty by default. */
  fullName?: string;
  coachId?: number | null;
  gymStaffId?: number | null;
  /** Explicit launcher-category override; omitted/null = inherit role default. */
  visibleCategories?: ToolCategory[] | null;
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
      fullName: input.fullName?.trim() ?? "",
      passwordHash: hashPassword(input.password),
      role: input.role,
      coachId: input.coachId ?? null,
      gymStaffId: input.gymStaffId ?? null,
      // Omitted → NULL (inherit the role's default categories).
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
    fullName?: string;
    role?: Role;
    active?: boolean;
    coachId?: number | null;
    gymStaffId?: number | null;
    /** Array = pin an override; null = reset to inherit the role default. */
    visibleCategories?: ToolCategory[] | null;
    password?: string;
  },
): Promise<void> {
  const db = await getDb();
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) set.displayName = patch.displayName.trim();
  if (patch.fullName !== undefined) set.fullName = patch.fullName.trim();
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
 * Capabilities introduced after a permission_config row may already have been
 * written are backfilled to the roles that hold them by default. Safe because a
 * brand-new capability can't have been intentionally revoked. Extend when adding
 * default-granted capabilities that must reach existing deployments.
 */
const BACKFILL_CAPS: Capability[] = [
  "finalize_kpi",
  "edit_lesson_plans",
  "review_lesson_plans",
  "submit_timesheet",
  "review_timesheet",
  "manage_freelancer_schedule",
];

/**
 * Migrate-on-read for the stored permission matrix (the same trick as the
 * capability backfill — no SQL migration needed):
 *
 * - Accepts BOTH stored shapes: the current `{ capabilities, categories }` and
 *   the legacy flat `Record<role, Capability[]>` written before launcher
 *   categories joined the matrix.
 * - Migrates the retired cross-brand capability keys to their brand-scoped
 *   pairs via {@link LEGACY_CAPABILITY_MAP} (a role that held `view_all_staff`
 *   comes out holding `swim_view_staff` + `fit_view_staff`, etc.) and drops the
 *   legacy keys.
 * - Backfills any configurable role missing from `capabilities` with its
 *   defaults (lets a newly added role work with no migration), plus the
 *   {@link BACKFILL_CAPS}.
 * - Backfills `categories` to ALL THREE launcher categories per role — the
 *   pre-unification behavior — until the owner tightens them in Settings.
 */
export function normalizePermissionConfig(
  data: PermissionConfig | LegacyPermissionConfig,
): PermissionConfig {
  // New shape carries `capabilities`; the legacy flat shape keyed roles directly.
  const rawCaps = (
    "capabilities" in data && isPlainObject(data.capabilities)
      ? data.capabilities
      : data
  ) as Partial<Record<ConfigurableRole, string[]>>;
  const rawCats =
    "categories" in data && isPlainObject(data.categories)
      ? (data.categories as Partial<Record<ConfigurableRole, ToolCategory[]>>)
      : {};

  const validCaps = new Set<string>(CAPABILITIES);
  const out: PermissionConfig = {
    capabilities: {} as PermissionConfig["capabilities"],
    categories: {} as PermissionConfig["categories"],
  };
  for (const role of CONFIGURABLE_ROLES) {
    const stored = Array.isArray(rawCaps[role])
      ? rawCaps[role]
      : DEFAULT_PERMISSION_CONFIG.capabilities[role];
    // Legacy cross-brand keys expand to both brand-scoped keys (exact same
    // effective access as before the split); anything unknown is dropped.
    const caps: Capability[] = [];
    const add = (cap: Capability) => {
      if (!caps.includes(cap)) caps.push(cap);
    };
    for (const cap of stored) {
      for (const mapped of LEGACY_CAPABILITY_MAP[cap] ?? []) add(mapped);
      if (validCaps.has(cap)) add(cap as Capability);
    }
    for (const cap of BACKFILL_CAPS) {
      if (DEFAULT_PERMISSION_CONFIG.capabilities[role].includes(cap)) add(cap);
    }
    out.capabilities[role] = caps;
    // Unknown/invalid stored values fall back to all (sanitize self-heals order/dupes).
    out.categories[role] = sanitizeToolCategories(rawCats[role]) ?? [...ALL_TOOL_CATEGORIES];
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
  /** Optional link to the lesson plan of the observed class (validated by the API). */
  lessonPlanId?: number | null;
}): Promise<AssessmentRecord> {
  const db = await getDb();
  const [row] = await db.insert(assessments).values(input).returning();
  return row;
}

/**
 * Validate an assessment → lesson-plan link before storing it: the plan must
 * exist AND belong to the assessed coach (`plan.coachId === coachId`). There is
 * no DB-level FK (repo convention), so this helper is the only integrity gate.
 */
export async function validateAssessmentLessonPlanLink(
  lessonPlanId: number,
  coachId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = await getLessonPlan(lessonPlanId);
  if (!plan) return { ok: false, error: "lesson plan not found" };
  if (plan.coachId !== coachId) {
    return { ok: false, error: "lesson plan belongs to a different coach" };
  }
  return { ok: true };
}

/** Assessments that link to one lesson plan (the plan page's back-links), newest first. */
export async function listAssessmentsForLessonPlan(
  lessonPlanId: number,
): Promise<AssessmentRecord[]> {
  const db = await getDb();
  return db
    .select()
    .from(assessments)
    .where(eq(assessments.lessonPlanId, lessonPlanId))
    .orderBy(desc(assessments.observedOn));
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
  lessonPlanId: number | null;
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
      lessonPlanId: assessments.lessonPlanId,
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

// ── Lesson plans ──────────────────────────────────────────────────────────────

/** The editable content of a lesson plan (everything except identity/workflow). */
export interface LessonPlanContent {
  instructorName: string;
  actualInstructorName: string;
  center: string;
  lessonDate: Date;
  timeLabel: string;
  levelType: LevelType | null;
  classLevel: string;
  ageGroup: string;
  data: LessonPlanData;
}

export async function createLessonPlan(
  input: LessonPlanContent & {
    type: LessonPlanType;
    createdByUserId: number;
    createdByName: string;
    coachId: number | null;
  },
): Promise<LessonPlanRecord> {
  const db = await getDb();
  const [row] = await db
    .insert(lessonPlans)
    .values({ ...input, status: "draft" })
    .returning();
  return row;
}

/**
 * Replace a plan's content. ANY content edit resets the status to draft so the
 * plan must be re-submitted and re-reviewed — but the last review note (and
 * reviewer attribution) is deliberately kept, so the owner can still see what
 * was asked of them while editing. The post-lesson self-evaluation
 * (`data.selfEval` + `data.remarks`, stamped by `selfEvalAt`) is NOT part of
 * the pre-class content: a content edit always preserves whatever is stored.
 */
export async function updateLessonPlan(id: number, content: LessonPlanContent): Promise<void> {
  const db = await getDb();
  const existing = await getLessonPlan(id);
  if (!existing) return;
  const data: LessonPlanData = {
    ...content.data,
    remarks: existing.data.remarks,
    selfEval: existing.data.selfEval,
  };
  await db
    .update(lessonPlans)
    .set({ ...content, data, status: "draft", updatedAt: new Date() })
    .where(eq(lessonPlans.id, id));
}

/**
 * Fill (or re-fill) the post-lesson self-evaluation. Unlike a content edit
 * this never touches the review status — an approved plan stays approved.
 * `selfEvalAt` records the latest fill.
 */
export async function setLessonPlanSelfEval(
  id: number,
  selfEval: Record<string, SelfEvalAnswer>,
  remarks: string,
): Promise<void> {
  const db = await getDb();
  const existing = await getLessonPlan(id);
  if (!existing) return;
  await db
    .update(lessonPlans)
    .set({
      data: { ...existing.data, selfEval, remarks },
      selfEvalAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(lessonPlans.id, id));
}

export async function getLessonPlan(id: number): Promise<LessonPlanRecord | undefined> {
  const db = await getDb();
  const rows = await db.select().from(lessonPlans).where(eq(lessonPlans.id, id)).limit(1);
  return rows[0];
}

/** A History list row — the promoted columns only, never the jsonb body. */
export interface LessonPlanListRow {
  id: number;
  type: LessonPlanType;
  status: LessonPlanStatus;
  createdByUserId: number;
  createdByName: string;
  instructorName: string;
  actualInstructorName: string;
  center: string;
  lessonDate: Date;
  timeLabel: string;
  levelType: LevelType | null;
  classLevel: string;
  selfEvalAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * List plans, newest lesson first. Pass `forUserId` to scope to one creator
 * (the editor's own-plans view); omit it for the reviewer's all-plans view.
 * Pass `coachId` to scope to one coach profile (the assessment form's
 * lesson-plan picker for the assessed coach).
 */
export async function listLessonPlans(
  opts: { forUserId?: number; coachId?: number } = {},
): Promise<LessonPlanListRow[]> {
  const db = await getDb();
  const projection = {
    id: lessonPlans.id,
    type: lessonPlans.type,
    status: lessonPlans.status,
    createdByUserId: lessonPlans.createdByUserId,
    createdByName: lessonPlans.createdByName,
    instructorName: lessonPlans.instructorName,
    actualInstructorName: lessonPlans.actualInstructorName,
    center: lessonPlans.center,
    lessonDate: lessonPlans.lessonDate,
    timeLabel: lessonPlans.timeLabel,
    levelType: lessonPlans.levelType,
    classLevel: lessonPlans.classLevel,
    selfEvalAt: lessonPlans.selfEvalAt,
    createdAt: lessonPlans.createdAt,
    updatedAt: lessonPlans.updatedAt,
  };
  const conditions = [
    ...(opts.forUserId != null ? [eq(lessonPlans.createdByUserId, opts.forUserId)] : []),
    ...(opts.coachId != null ? [eq(lessonPlans.coachId, opts.coachId)] : []),
  ];
  const base = db.select(projection).from(lessonPlans);
  const query = conditions.length > 0 ? base.where(and(...conditions)) : base;
  return query.orderBy(desc(lessonPlans.lessonDate), desc(lessonPlans.id));
}

/** Move a draft / changes-requested plan into the review queue. */
export async function submitLessonPlan(id: number): Promise<void> {
  const db = await getDb();
  await db
    .update(lessonPlans)
    .set({ status: "submitted", updatedAt: new Date() })
    .where(eq(lessonPlans.id, id));
}

/** Record a review outcome: approve, or send back with a note. */
export async function reviewLessonPlan(
  id: number,
  action: "approve" | "request_changes",
  note: string,
  reviewer: { email: string },
): Promise<void> {
  const db = await getDb();
  await db
    .update(lessonPlans)
    .set({
      status: action === "approve" ? "approved" : "changes_requested",
      reviewNote: note,
      reviewedByEmail: reviewer.email,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(lessonPlans.id, id));
}

export async function deleteLessonPlan(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(lessonPlans).where(eq(lessonPlans.id, id));
}

/* --------------------------------- timesheets ---------------------------------- */

export interface TimesheetEntryInput {
  coachId: number;
  periodLabel: string;
  date: string;
  center: string;
  entryType: TimesheetEntryType;
  classType: TimesheetClassType | null;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  note: string;
}

/** One clock-in entry. New entries always land as a draft. */
export async function createTimesheetEntry(input: TimesheetEntryInput): Promise<TimesheetRecord> {
  const db = await getDb();
  const [row] = await db
    .insert(timesheets)
    .values({ ...input, status: "draft" })
    .returning();
  return row;
}

/**
 * Replace an entry's content. ANY edit resets it to draft (mirrors lesson
 * plans) so a corrected entry must be re-submitted; it also clears any admin
 * `slotType` override, since the content the override was based on changed.
 */
export async function updateTimesheetEntry(id: number, input: TimesheetEntryInput): Promise<void> {
  const db = await getDb();
  await db
    .update(timesheets)
    .set({ ...input, slotType: null, status: "draft", updatedAt: new Date() })
    .where(eq(timesheets.id, id));
}

export async function getTimesheetEntry(id: number): Promise<TimesheetRecord | undefined> {
  const db = await getDb();
  const rows = await db.select().from(timesheets).where(eq(timesheets.id, id)).limit(1);
  return rows[0];
}

/** A coach's entries for one month (or all months), newest date first. */
export async function listTimesheetsForCoach(
  coachId: number,
  periodLabel?: string,
): Promise<TimesheetRecord[]> {
  const db = await getDb();
  const conditions = [
    eq(timesheets.coachId, coachId),
    ...(periodLabel != null ? [eq(timesheets.periodLabel, periodLabel)] : []),
  ];
  return db
    .select()
    .from(timesheets)
    .where(and(...conditions))
    .orderBy(desc(timesheets.date), desc(timesheets.id));
}

export async function deleteTimesheetEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(timesheets).where(eq(timesheets.id, id));
}

/**
 * Submit a coach's month for review: flip every draft / changes_requested entry
 * for that coach + period to submitted. Approved entries are left untouched (an
 * edit to one already bounced it back to draft). Returns the count submitted.
 */
export async function submitTimesheetsForPeriod(
  coachId: number,
  periodLabel: string,
): Promise<number> {
  const db = await getDb();
  const rows = await db
    .update(timesheets)
    .set({ status: "submitted", updatedAt: new Date() })
    .where(
      and(
        eq(timesheets.coachId, coachId),
        eq(timesheets.periodLabel, periodLabel),
        inArray(timesheets.status, ["draft", "changes_requested"]),
      ),
    )
    .returning({ id: timesheets.id });
  return rows.length;
}

export interface TimesheetReviewRow {
  id: number;
  coachId: number;
  coachName: string | null;
  periodLabel: string;
  date: string;
  center: string;
  entryType: TimesheetEntryType;
  classType: TimesheetClassType | null;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  status: "draft" | "submitted" | "approved" | "changes_requested";
  note: string;
  reviewNote: string;
}

/**
 * The reviewer's queue across all coaches. Defaults to entries awaiting review
 * (`submitted`); pass a status to see another bucket. Joined to the coach name
 * so the UI can group by person. Ordered by coach then date.
 */
export async function listTimesheetsForReview(
  opts: { periodLabel?: string; status?: TimesheetReviewRow["status"] } = {},
): Promise<TimesheetReviewRow[]> {
  const db = await getDb();
  const conditions = [
    eq(timesheets.status, opts.status ?? "submitted"),
    ...(opts.periodLabel != null ? [eq(timesheets.periodLabel, opts.periodLabel)] : []),
  ];
  return db
    .select({
      id: timesheets.id,
      coachId: timesheets.coachId,
      coachName: coaches.canonicalName,
      periodLabel: timesheets.periodLabel,
      date: timesheets.date,
      center: timesheets.center,
      entryType: timesheets.entryType,
      classType: timesheets.classType,
      startTime: timesheets.startTime,
      endTime: timesheets.endTime,
      hours: timesheets.hours,
      status: timesheets.status,
      note: timesheets.note,
      reviewNote: timesheets.reviewNote,
    })
    .from(timesheets)
    .leftJoin(coaches, eq(timesheets.coachId, coaches.id))
    .where(and(...conditions))
    .orderBy(asc(coaches.canonicalName), asc(timesheets.date), asc(timesheets.id));
}

/**
 * Batch review: flip the given entries to approved / changes_requested with the
 * reviewer's note + attribution. Guarded to entries currently `submitted`, so a
 * stale id (already reviewed or edited back to draft) is skipped rather than
 * silently re-decided. Returns the count actually reviewed.
 */
export async function reviewTimesheets(
  ids: number[],
  action: "approve" | "request_changes",
  note: string,
  reviewerId: number,
): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const rows = await db
    .update(timesheets)
    .set({
      status: action === "approve" ? "approved" : "changes_requested",
      reviewNote: note,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(inArray(timesheets.id, ids), eq(timesheets.status, "submitted")))
    .returning({ id: timesheets.id });
  return rows.length;
}

/* ----------------------------- freelancer schedules ---------------------------- */

export interface FreelancerScheduleSlotInput {
  weekday: number;
  startTime: string;
  endTime: string;
  center: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export async function listFreelancerSchedule(coachId: number): Promise<FreelancerScheduleRecord[]> {
  const db = await getDb();
  return db
    .select()
    .from(freelancerSchedules)
    .where(eq(freelancerSchedules.coachId, coachId))
    .orderBy(
      asc(freelancerSchedules.weekday),
      asc(freelancerSchedules.startTime),
      asc(freelancerSchedules.id),
    );
}

/**
 * Replace a freelancer's whole fixed schedule in one transaction (the UI edits
 * the weekly grid and saves it as a set). Atomic so a concurrent read never
 * sees a half-written schedule.
 */
export async function replaceFreelancerSchedule(
  coachId: number,
  slots: FreelancerScheduleSlotInput[],
): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(freelancerSchedules).where(eq(freelancerSchedules.coachId, coachId));
    if (slots.length > 0) {
      await tx.insert(freelancerSchedules).values(slots.map((s) => ({ ...s, coachId })));
    }
  });
}

/* --------------------- load approved clock-ins into the calculators -------------------- */

/**
 * Approved teaching (lesson) hours for a coach's month → allowance
 * `teachingRows`, ready to seed the Staff Allowance calculator. Only `approved`
 * entries count; `shift` and unreviewed entries are ignored.
 */
export async function getApprovedTeachingRows(
  coachId: number,
  period: string,
): Promise<TeachingHoursRow[]> {
  const entries = await listTimesheetsForCoach(coachId, period);
  return aggregateTeaching(
    entries
      .filter((e) => e.status === "approved" && e.entryType === "lesson")
      .map((e) => ({ center: e.center, entryType: "lesson" as const, classType: e.classType, hours: e.hours })),
  );
}

/**
 * Approved hours for a freelancer's month, reconciled against their fixed
 * schedule → `FreelancerCenterRow[]` (fixed / replaced / absent) + the absence
 * list, ready to seed the Freelancer Payment calculator. Only `approved`
 * entries count.
 */
export async function getApprovedFreelancerRows(
  coachId: number,
  period: string,
): Promise<ReconcileResult> {
  const [entries, schedule] = await Promise.all([
    listTimesheetsForCoach(coachId, period),
    listFreelancerSchedule(coachId),
  ]);
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return reconcileFreelancer(
    schedule.map((s) => ({ weekday: s.weekday, center: s.center })),
    entries
      .filter((e) => e.status === "approved")
      .map((e) => ({ date: e.date, center: e.center, hours: e.hours })),
    year,
    month,
  );
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

/* ── Error tracking (/system/errors) ───────────────────────────────────────── */

export interface AppErrorEntry {
  source: "server" | "client";
  message: string;
  stack?: string | null;
  path?: string | null;
  userId?: number | null;
  userEmail?: string;
  userAgent?: string | null;
}

/** Errors older than this are trimmed opportunistically on insert. */
const APP_ERROR_RETENTION_DAYS = 30;

/**
 * Append one captured error. MUST swallow its own failures silently — it is
 * called from the error-level log sink (lib/observability.ts), so logging a
 * failure here at error level would recurse straight back in. Field lengths
 * are capped so a pathological error can't bloat a row.
 */
export async function recordAppError(entry: AppErrorEntry): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(appErrors).values({
      source: entry.source,
      message: entry.message.slice(0, 2_000),
      stack: entry.stack ? entry.stack.slice(0, 8_000) : null,
      path: entry.path ? entry.path.slice(0, 500) : null,
      userId: entry.userId ?? null,
      userEmail: entry.userEmail ?? "",
      userAgent: entry.userAgent ? entry.userAgent.slice(0, 300) : null,
    });
    // Opportunistic retention trim (~1 insert in 50) so the table can't grow
    // unbounded between manual clears.
    if (Math.random() < 0.02) {
      await db
        .delete(appErrors)
        .where(
          sql`${appErrors.createdAt} < now() - make_interval(days => ${APP_ERROR_RETENTION_DAYS})`,
        );
    }
  } catch {
    /* see docblock — never throw, never log at error level */
  }
}

/** Most recent captured errors first. */
export async function listAppErrors(limit = 300): Promise<AppErrorRecord[]> {
  const db = await getDb();
  return db
    .select()
    .from(appErrors)
    .orderBy(desc(appErrors.createdAt), desc(appErrors.id))
    .limit(limit);
}

/** Wipe the captured-error list (super_admin "Clear all" on /system/errors). */
export async function clearAppErrors(): Promise<void> {
  const db = await getDb();
  await db.delete(appErrors);
}

/* ── Freelancer ↔ KPI result binding ───────────────────────────────────────── */

export interface KpiResultCandidate {
  /** RAW instructor account name exactly as it appears in the month's KPI data. */
  name: string;
  black: number;
  colour: number;
}

/**
 * Black/colour totals per instructor account in a period's KPI data — the
 * source for the Freelancer Payment "student result" binding. Reads the
 * latest SAVED KPI run for the period, falling back to the latest pending
 * ingest (data is pushed on the 1st of the FOLLOWING month, so early in that
 * window only the staged delivery may exist). Empty when neither exists yet.
 *
 * Accounts are NOT merged by `getCleanName` (operator decision 2026-06-12):
 * branch accounts like `CK [BK]` / `CK [PK]` stay separate candidates so a
 * freelancer's result binds the branch account they actually teach at.
 * Multiple rows of the SAME raw account (e.g. per-center) still sum.
 */
export async function getKpiResultCandidates(periodLabel: string): Promise<KpiResultCandidate[]> {
  const db = await getDb();
  const [run] = await db
    .select({ csvRows: runs.csvRows })
    .from(runs)
    .where(eq(runs.periodLabel, periodLabel))
    .orderBy(desc(runs.createdAt))
    .limit(1);
  let rows = run?.csvRows;
  if (!rows?.length) {
    const [ingest] = await db
      .select({ rows: kpiIngests.rows })
      .from(kpiIngests)
      .where(and(eq(kpiIngests.periodLabel, periodLabel), eq(kpiIngests.status, "pending")))
      .orderBy(desc(kpiIngests.receivedAt))
      .limit(1);
    rows = ingest?.rows;
  }
  if (!rows?.length) return [];
  const byName = new Map<string, { black: number; colour: number }>();
  for (const r of rows) {
    const name = String(r.Instructor ?? "").trim();
    if (!name) continue;
    const cur = byName.get(name) ?? { black: 0, colour: 0 };
    cur.black += Number(r.Black) || 0;
    cur.colour += Number(r.TotalColor) || 0;
    byName.set(name, cur);
  }
  return [...byName.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Each freelancer's most recent KPI binding (latest run's input.kpiName),
 * keyed by canonical name — the calculator's carry-over: picking the coach
 * next month auto-fetches that month's numbers for the bound account.
 */
export async function getLatestFreelancerKpiNames(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db
    .select({ canonicalName: freelancerRuns.canonicalName, input: freelancerRuns.input })
    .from(freelancerRuns)
    .orderBy(desc(freelancerRuns.createdAt), desc(freelancerRuns.id));
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (out[r.canonicalName] !== undefined) continue;
    const bound = (r.input as { kpiName?: string | null }).kpiName;
    if (typeof bound === "string" && bound.trim()) out[r.canonicalName] = bound.trim();
  }
  return out;
}
