import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./index";
import {
  allowanceConfig,
  allowanceRuns,
  coaches,
  config,
  runs,
  type AllowanceRunRecord,
  type CoachRecord,
  type RunRecord,
} from "./schema";
import {
  DEFAULT_CENTER_KPI,
  DEFAULT_CENTER_TARGETS,
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_PERSONAL_KPI,
} from "@/lib/kpi/metrics";
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
} from "@/lib/allowance/types";

export function defaultConfig(): AppConfig {
  return {
    personalKpi: structuredClone(DEFAULT_PERSONAL_KPI),
    centerKpi: structuredClone(DEFAULT_CENTER_KPI),
    centerTargets: structuredClone(DEFAULT_CENTER_TARGETS),
    gradeThresholds: { ...DEFAULT_GRADE_THRESHOLDS },
  };
}

/** Read the singleton config, seeding defaults on first use. */
export async function getConfig(): Promise<AppConfig> {
  const db = await getDb();
  const rows = await db.select().from(config).where(eq(config.id, 1)).limit(1);
  if (rows[0]) return rows[0].data;
  const data = defaultConfig();
  await db.insert(config).values({ id: 1, data }).onConflictDoNothing();
  return data;
}

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

/** Update editable staff profile fields (name, center, position tier, active). */
export async function updateCoach(
  id: number,
  patch: Partial<Pick<CoachRecord, "canonicalName" | "center" | "allowanceTier" | "active">>,
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
export async function getAllowanceConfig(): Promise<AllowanceConfig> {
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
}

export async function saveAllowanceConfig(data: AllowanceConfig): Promise<void> {
  const db = await getDb();
  await db
    .insert(allowanceConfig)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: allowanceConfig.id, set: { data, updatedAt: new Date() } });
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
    grandTotal: r.result.grandTotal,
    createdAt: r.createdAt,
  }));
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
