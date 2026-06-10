/**
 * Duplicate-alias detection for coach profiles.
 *
 * A CSV account name (alias) must belong to exactly ONE coach profile — when
 * two profiles claim the same alias, monthly uploads match ambiguously and the
 * coach's history forks (the "ARIF - LMY [PK]" incident; the Staff → Directory
 * merge tool fixes existing duplicates). These pure helpers power the warning
 * card on /kpi/links and the server-side guard in /api/kpi/links/[id].
 *
 * Comparison is case-insensitive after trimming: merge matching is exact, but
 * two profiles whose aliases differ only by case are still one human's account.
 */

export interface AliasOwner {
  canonicalName: string;
  aliases: string[];
}

export interface DuplicateAlias {
  alias: string;
  /** Canonical names of every profile claiming this alias (2+). */
  owners: string[];
}

const key = (s: string) => s.trim().toLowerCase();

/** Aliases claimed by 2+ profiles, sorted A–Z by alias. */
export function findDuplicateAliases(profiles: AliasOwner[]): DuplicateAlias[] {
  const byAlias = new Map<string, DuplicateAlias>();
  for (const p of profiles) {
    const seen = new Set<string>(); // the same alias twice on ONE profile is not a conflict
    for (const a of p.aliases) {
      const k = key(a);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const entry = byAlias.get(k) ?? { alias: a.trim(), owners: [] };
      entry.owners.push(p.canonicalName);
      byAlias.set(k, entry);
    }
  }
  return [...byAlias.values()]
    .filter((e) => e.owners.length >= 2)
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

export interface AliasConflict {
  alias: string;
  ownerName: string;
}

/**
 * First submitted alias that already belongs to a DIFFERENT profile — listed
 * in its aliases or equal to its canonical name. Null when all are free.
 * `coachId` is the profile being edited, so its own names never conflict.
 */
export function findAliasConflict(
  coachId: number,
  aliases: string[],
  profiles: (AliasOwner & { id: number })[],
): AliasConflict | null {
  const others = profiles.filter((p) => p.id !== coachId);
  for (const a of aliases) {
    const k = key(a);
    if (!k) continue;
    for (const p of others) {
      if (key(p.canonicalName) === k || p.aliases.some((x) => key(x) === k)) {
        return { alias: a.trim(), ownerName: p.canonicalName };
      }
    }
  }
  return null;
}
