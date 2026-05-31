/**
 * Linking a KPI coach group to its saved teaching-allowance record.
 *
 * The two sides are entered independently — KPI account names come from the CSV
 * (resolved to an UPPER base name by the classifier), while an allowance record
 * carries whatever name was typed/picked in the Allowance Calculator. Exact
 * case-sensitive equality (the old behavior) misses the common cases: different
 * casing ("Vassenthan" vs "VASSEN"), a short name vs the full name, or a coach
 * whose KPI group has no profile id yet. This module resolves the link through
 * a deterministic ladder so the leaderboard stops hiding coaches that really do
 * have an allowance.
 */

import { getCleanName } from "./csv";

/** Minimal shape of a saved allowance record needed to link it. */
export interface AllowanceLinkRec {
  coachId: number | null;
  canonicalName: string;
  /** The original CSV account names this allowance's coach was saved under. */
  aliases?: string[];
}

/** Minimal shape of a KPI coach group needed to link it. */
export interface CoachLinkInfo {
  coachId: number | null;
  canonicalName: string;
  /** The raw CSV account names merged into this coach. */
  accounts: string[];
}

/** How a link was made — drives the UI badge + confidence. */
export type LinkMethod = "coachId" | "exact" | "normalized" | "alias" | "none";

export interface LinkResult<R> {
  rec: R | null;
  method: LinkMethod;
}

/** Normalize a name for tolerant comparison: trim, collapse spaces, upper-case. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Resolve which allowance record (if any) belongs to a coach group, trying the
 * most reliable signal first:
 *   1. coachId equality (both sides linked to the same profile)
 *   2. exact canonicalName equality (preserves old behavior)
 *   3. normalized-name equality (case/spacing-insensitive, base name vs base name)
 *   4. alias overlap — the allowance's saved accounts vs this coach's accounts
 *
 * Pure + deterministic. Lower-priority matches never override a higher one.
 */
export function linkAllowance<R extends AllowanceLinkRec>(
  list: R[],
  coach: CoachLinkInfo,
): LinkResult<R> {
  if (coach.coachId != null) {
    const byId = list.find((r) => r.coachId != null && r.coachId === coach.coachId);
    if (byId) return { rec: byId, method: "coachId" };
  }

  const exact = list.find((r) => r.canonicalName === coach.canonicalName);
  if (exact) return { rec: exact, method: "exact" };

  // Normalized: compare the coach's canonical/base name to each record's, both
  // run through the same clean-name normalizer the merge pass uses.
  const coachKey = normalizeName(getCleanName(coach.canonicalName));
  const norm = list.find((r) => normalizeName(getCleanName(r.canonicalName)) === coachKey);
  if (norm) return { rec: norm, method: "normalized" };

  // Alias overlap: the allowance record was saved under one of this coach's CSV
  // accounts (or vice-versa).
  const acctSet = new Set(coach.accounts.map(normalizeName));
  const byAlias = list.find((r) =>
    (r.aliases ?? []).some((a) => acctSet.has(normalizeName(a))),
  );
  if (byAlias) return { rec: byAlias, method: "alias" };

  return { rec: null, method: "none" };
}

/**
 * Pair every allowance record against the coach groups, reporting which records
 * linked and which are orphans (entered but matching no coach this month).
 * A record links to at most one coach; the first coach (in input order) wins.
 */
export function reconcileAllowances<R extends AllowanceLinkRec>(
  list: R[],
  coaches: CoachLinkInfo[],
): {
  links: { coach: CoachLinkInfo; rec: R; method: LinkMethod }[];
  unmatchedCoaches: CoachLinkInfo[];
  orphanRecs: R[];
} {
  const links: { coach: CoachLinkInfo; rec: R; method: LinkMethod }[] = [];
  const unmatchedCoaches: CoachLinkInfo[] = [];
  const usedRec = new Set<R>();

  for (const coach of coaches) {
    const remaining = list.filter((r) => !usedRec.has(r));
    const { rec, method } = linkAllowance(remaining, coach);
    if (rec) {
      usedRec.add(rec);
      links.push({ coach, rec, method });
    } else {
      unmatchedCoaches.push(coach);
    }
  }

  const orphanRecs = list.filter((r) => !usedRec.has(r));
  return { links, unmatchedCoaches, orphanRecs };
}
