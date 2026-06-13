// Deterministic user→coach name matching for the Users page "AI auto-link".
// Pure (no DB/AI) so it can be unit-locked: this decides who gets linked to a
// coach profile (and so who can clock in), so a wrong match matters.

import { getCleanName } from "@/lib/kpi/csv";

export interface LinkUser {
  id: number;
  name: string;
}
export interface LinkCoach {
  id: number;
  name: string;
}
export interface UserCoachLink {
  userId: number;
  coachId: number;
}

/**
 * Confident name matches: a user links to a coach only when their cleaned names
 * (`getCleanName` — upper-cased, branch/`- …` suffixes stripped) are equal AND
 * exactly ONE coach carries that cleaned name (so ambiguous "CK [BK]" / "CK [PK]"
 * pairs are left for a human / the AI pass). Each coach is used at most once.
 * Returns links in input-user order. AI handles whatever this leaves unmatched.
 */
export function deterministicLinks(users: LinkUser[], coaches: LinkCoach[]): UserCoachLink[] {
  const byClean = new Map<string, number[]>();
  for (const c of coaches) {
    const k = getCleanName(c.name);
    if (!k) continue;
    const list = byClean.get(k);
    if (list) list.push(c.id);
    else byClean.set(k, [c.id]);
  }

  const used = new Set<number>();
  const links: UserCoachLink[] = [];
  for (const u of users) {
    const k = getCleanName(u.name);
    if (!k) continue;
    const all = byClean.get(k);
    if (!all || all.length !== 1) continue; // unknown or ambiguous → skip
    const coachId = all[0];
    if (used.has(coachId)) continue; // another user already claimed this coach
    links.push({ userId: u.id, coachId });
    used.add(coachId);
  }
  return links;
}
