// Deterministic user→coach name matching for the Users page "AI auto-link".
// Pure (no DB/AI) so it can be unit-locked: this decides who gets linked to a
// coach profile (and so who can clock in / be paid), so a wrong match matters.
// PRECISION-FIRST — rather under-link than mis-link.

import { getCleanName } from "@/lib/kpi/csv";

export interface LinkUser {
  id: number;
  /** Everyday nickname (often a short/English handle). */
  displayName: string;
  /** Legal/full name — the strongest signal (matches a coach's canonical name). */
  fullName: string;
  email: string;
}
export interface LinkCoach {
  id: number;
  name: string;
}
export interface UserCoachLink {
  userId: number;
  coachId: number;
}

/** Clean a name to comparable tokens (upper-cased, branch/`- …` suffixes stripped). */
function cleanTokens(name: string): string[] {
  return getCleanName(name).split(/\s+/).filter(Boolean);
}

function setEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
/** Is every member of `sub` also in `sup`? */
function subset(sub: Set<string>, sup: Set<string>): boolean {
  for (const x of sub) if (!sup.has(x)) return false;
  return true;
}

interface CoachIdx {
  id: number;
  clean: string;
  tokens: Set<string>;
}

/**
 * Confidence tier of a user name KEY against a coach (higher = stronger):
 *   3 — exact cleaned name;
 *   2 — same token SET, any order (≥2 tokens — handles "Lee Darren" ↔ "Darren Lee");
 *   1 — one name's tokens fully contained in the other (smaller side ≥2 tokens —
 *       e.g. "CHEE HAU" ⊆ "YAP CHEE HAU").
 * A single-token key never reaches a token tier, so a bare "ANWAR" can't grab one
 * of many "MUHAMMAD ANWAR …" coaches.
 */
function keyTier(keyClean: string, keyTokens: Set<string>, c: CoachIdx): 0 | 1 | 2 | 3 {
  if (!keyClean) return 0;
  if (keyClean === c.clean) return 3;
  if (keyTokens.size >= 2 && setEqual(keyTokens, c.tokens)) return 2;
  if (keyTokens.size >= 2 && subset(keyTokens, c.tokens)) return 1;
  if (c.tokens.size >= 2 && subset(c.tokens, keyTokens)) return 1;
  return 0;
}

/** The user's name keys, strongest first: legal full name, then nickname. */
function nameKeys(u: LinkUser): { clean: string; tokens: Set<string> }[] {
  const seen = new Set<string>();
  const keys: { clean: string; tokens: Set<string> }[] = [];
  for (const raw of [u.fullName, u.displayName]) {
    const toks = cleanTokens(raw ?? "");
    const clean = toks.join(" ");
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    keys.push({ clean, tokens: new Set(toks) });
  }
  return keys;
}

/**
 * Confident user→coach links by name. For each user we take the strongest tier
 * achievable across their full name + nickname; a match counts only when exactly
 * ONE coach reaches that top tier (ties are ambiguous → left for the AI pass / a
 * human). Matches are then assigned globally strongest-first, each coach used at
 * most once. AI handles whatever this leaves unmatched.
 */
export function deterministicLinks(users: LinkUser[], coaches: LinkCoach[]): UserCoachLink[] {
  const idx: CoachIdx[] = coaches
    .map((c) => {
      const toks = cleanTokens(c.name);
      return { id: c.id, clean: toks.join(" "), tokens: new Set(toks) };
    })
    .filter((c) => c.clean);

  type Intended = { userId: number; coachId: number; tier: number };
  const intended: Intended[] = [];
  for (const u of users) {
    const keys = nameKeys(u);
    if (keys.length === 0) continue;
    let topTier = 0;
    const topCoaches: number[] = [];
    for (const c of idx) {
      let tier: 0 | 1 | 2 | 3 = 0;
      for (const k of keys) {
        const t = keyTier(k.clean, k.tokens, c);
        if (t > tier) tier = t;
      }
      if (tier === 0) continue;
      if (tier > topTier) {
        topTier = tier;
        topCoaches.length = 0;
        topCoaches.push(c.id);
      } else if (tier === topTier) {
        topCoaches.push(c.id);
      }
    }
    if (topTier === 0 || topCoaches.length !== 1) continue; // unknown or ambiguous
    intended.push({ userId: u.id, coachId: topCoaches[0], tier: topTier });
  }

  // Assign globally strongest-first; each coach and user used at most once.
  intended.sort((a, b) => b.tier - a.tier || a.userId - b.userId);
  const usedCoach = new Set<number>();
  const usedUser = new Set<number>();
  const links: UserCoachLink[] = [];
  for (const m of intended) {
    if (usedCoach.has(m.coachId) || usedUser.has(m.userId)) continue;
    usedCoach.add(m.coachId);
    usedUser.add(m.userId);
    links.push({ userId: m.userId, coachId: m.coachId });
  }
  // Emit in user input order for a stable, predictable result.
  const order = new Map(users.map((u, i) => [u.id, i]));
  links.sort((a, b) => (order.get(a.userId) ?? 0) - (order.get(b.userId) ?? 0));
  return links;
}

/**
 * Safety gate for an AI-proposed match: accept only when the coach name shares a
 * real token (≥3 chars) with the user's full name, nickname, or the alphabetic
 * part of their email local-part. Kills hallucinated links for accounts with no
 * name signal (e.g. a phone-number email matched to a random coach).
 */
export function sharesNameSignal(u: LinkUser, coachName: string): boolean {
  const coachTokens = cleanTokens(coachName).filter((t) => t.length >= 3);
  if (coachTokens.length === 0) return false;
  const local = (u.email.split("@")[0] ?? "").replace(/[^a-zA-Z]+/g, " ");
  const userTokens = new Set(
    cleanTokens(`${u.fullName ?? ""} ${u.displayName ?? ""} ${local}`).filter((t) => t.length >= 3),
  );
  return coachTokens.some((t) => userTokens.has(t));
}
