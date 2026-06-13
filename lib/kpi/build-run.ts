import { classifyAccount } from "./classify";
import { computeCoach } from "./coach";
import { appearsInLeaderboard } from "./leaderboard";
import { buildGroups, uniqueInstructorNames, type KnownCoach } from "./merge";
import type { AppConfig, InstructorRow } from "./types";
import type { AccountForMatch } from "@/lib/ai/anthropic";
import type { Position, RunCoach } from "@/lib/types";

/** A coach profile as the server-side compute needs it (merge + carry-over). */
export interface BuildRunCoachProfile {
  id: number;
  canonicalName: string;
  aliases: string[];
  defaultPosition: Position;
  lastAllowance: number | null;
  lastMgmtAssessment: number | null;
}

export interface BuildRunInput {
  rows: InstructorRow[];
  config: AppConfig;
  coaches: BuildRunCoachProfile[];
  /** AI same-person clusters (best-effort; [] without an API key). */
  aiClusters?: string[][];
  /** Period overlays the caller resolves, keyed by coachId. */
  allowanceByCoachId?: Record<number, number>;
  assessmentByCoachId?: Record<number, number>;
}

/** Most frequent value, ties broken by first-seen (Map) order — matches the dashboard. */
function mostCommon(values: string[]): string {
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/** Build the per-account hints the AI name-merge prompt wants (one per account). */
export function accountsForMatch(rows: InstructorRow[]): AccountForMatch[] {
  return uniqueInstructorNames(rows).map((name) => {
    const mine = rows.filter((r) => r.Instructor === name);
    return {
      name,
      center: mine[0]?.Center ?? "",
      students: mine.reduce((s, r) => s + (r.TotalStudent ?? 0), 0),
    };
  });
}

/**
 * Server-side equivalent of the KPI dashboard's merge → carry-over → compute,
 * producing the draft `RunCoach[]` for a Student Progress delivery WITHOUT the
 * manual calculator step. Faithful to the dashboard:
 *   - merge = deterministic base-name grouping + known-coach aliases + optional
 *     AI same-person clusters;
 *   - the classifier's `defaultInclude` decides which accounts score (numbered/
 *     placeholder/co-teach default OUT but stay re-addable in the review screen);
 *   - center = the group's most-common CSV center;
 *   - carry-over allowance + management assessment come from the coach profile,
 *     overlaid by the period's saved allowance / latest assessment when supplied;
 *   - only groups with an allowance AND real teaching appear
 *     (`appearsInLeaderboard`), ranked by finalScore desc.
 *
 * The output is a reviewable DRAFT: any coach missing the management assessment,
 * an allowance, or a supervisor's group hours stays `isComplete: false`, so a
 * manager fills the gaps and finalizes on the existing review screen.
 */
export function buildRunCoaches(input: BuildRunInput): RunCoach[] {
  const {
    rows,
    config,
    coaches,
    aiClusters = [],
    allowanceByCoachId = {},
    assessmentByCoachId = {},
  } = input;

  const names = uniqueInstructorNames(rows);
  const known: KnownCoach[] = coaches.map((c) => ({
    canonicalName: c.canonicalName,
    aliases: c.aliases,
  }));
  const groups = buildGroups({
    names,
    aiClusters,
    knownCoaches: known,
    classifyConfig: config.classify,
  });

  const built: RunCoach[] = groups.map((g) => {
    const profile = coaches.find(
      (c) => c.canonicalName === g.canonicalName || c.aliases.some((al) => g.accounts.includes(al)),
    );
    const coachId = profile?.id ?? null;
    const position: Position = profile?.defaultPosition ?? "Instructor";
    // Numbered/placeholder/co-teach rows default out of scoring (kept re-addable
    // in review); only the included accounts feed the score + persist.
    const includedNames = g.accounts.filter((a) => classifyAccount(a, config.classify).defaultInclude);
    const center = mostCommon(
      g.accounts.map((a) => rows.find((r) => r.Instructor === a)?.Center ?? ""),
    );
    const allowance =
      coachId != null && allowanceByCoachId[coachId] != null
        ? allowanceByCoachId[coachId]
        : profile?.lastAllowance ?? null;
    const mgmt =
      coachId != null && assessmentByCoachId[coachId] != null
        ? assessmentByCoachId[coachId]
        : profile?.lastMgmtAssessment ?? null;

    const comp = computeCoach({
      accounts: includedNames,
      rows,
      config,
      inputs: { position, teachingAllowance: allowance, mgmtAssessment: mgmt, groupConfig: null },
    });

    return {
      coachId,
      canonicalName: g.canonicalName,
      accounts: includedNames,
      center,
      position,
      teachingAllowance: allowance,
      mgmtAssessment: mgmt,
      groupConfig: null,
      students: comp.students,
      personalScore: comp.personalScore,
      groupScore: comp.groupScore,
      finalScore: comp.finalScore,
      grade: comp.grade,
      payout: comp.payout,
      breakdown: comp.breakdown,
      isComplete: comp.isComplete,
    };
  });

  return built
    .filter((rc) =>
      appearsInLeaderboard({
        allowance: rc.teachingAllowance,
        students: rc.students,
        groupScore: rc.groupScore,
      }),
    )
    .sort((a, b) => b.finalScore - a.finalScore || a.canonicalName.localeCompare(b.canonicalName));
}
