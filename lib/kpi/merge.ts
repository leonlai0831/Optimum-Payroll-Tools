import { getCleanName } from "./csv";
import { classifyAccount, DEFAULT_CLASSIFY_CONFIG, type ClassifyConfig } from "./classify";
import type { InstructorRow } from "./types";

export interface MergeGroup {
  /** Display/canonical name for the merged coach. */
  canonicalName: string;
  /** Original CSV account names that belong to this coach. */
  accounts: string[];
}

export interface KnownCoach {
  canonicalName: string;
  aliases: string[];
}

/** Distinct, non-empty instructor account names from parsed rows. */
export function uniqueInstructorNames(rows: InstructorRow[]): string[] {
  return [
    ...new Set(
      rows
        .map((r) => r.Instructor)
        .filter((n) => n && n !== "Unknown"),
    ),
  ].sort();
}

class DSU {
  private parent = new Map<string, string>();
  add(x: string) {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }
  find(x: string): string {
    this.add(x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // path compression
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Build merged coach groups from raw account names by combining three signals:
 *  1. Known aliases from existing coach profiles (cross-month memory).
 *  2. Deterministic base-name grouping from the classifier (numbered overflow,
 *     placeholders, co-teach, branch suffixes and cross-center same-name all
 *     resolve to one coach), falling back to the v11.1 clean-name.
 *  3. AI-suggested clusters of same-person names.
 *
 * Pure: AI clusters are computed elsewhere and passed in. With no AI clusters
 * and no known coaches, this reduces to deterministic base-name grouping.
 */
export function buildGroups(opts: {
  names: string[];
  aiClusters?: string[][];
  knownCoaches?: KnownCoach[];
  classifyConfig?: ClassifyConfig;
}): MergeGroup[] {
  const {
    names,
    aiClusters = [],
    knownCoaches = [],
    classifyConfig = DEFAULT_CLASSIFY_CONFIG,
  } = opts;
  const dsu = new DSU();
  names.forEach((n) => dsu.add(n));

  // Resolved base coach name per account. The classifier strips center/class
  // codes and attributes numbered/co-teach rows to their owning coach; the
  // clean-name is a fallback when it yields nothing.
  const baseOf = new Map<string, string>();
  for (const n of names) {
    baseOf.set(n, classifyAccount(n, classifyConfig).baseName || getCleanName(n));
  }

  // 1. Known aliases: union all aliases of a coach that appear in this upload.
  const aliasToCoach = new Map<string, string>();
  for (const coach of knownCoaches) {
    const present = coach.aliases.filter((a) => names.includes(a));
    for (const a of present) aliasToCoach.set(a, coach.canonicalName);
    for (let i = 1; i < present.length; i++) dsu.union(present[0], present[i]);
  }

  // 2. Deterministic base-name grouping.
  const byBase = new Map<string, string[]>();
  for (const n of names) {
    const key = baseOf.get(n)!;
    const arr = byBase.get(key) ?? [];
    arr.push(n);
    byBase.set(key, arr);
  }
  for (const arr of byBase.values()) {
    for (let i = 1; i < arr.length; i++) dsu.union(arr[0], arr[i]);
  }

  // 3. AI clusters.
  for (const cluster of aiClusters) {
    const present = cluster.filter((n) => names.includes(n));
    for (let i = 1; i < present.length; i++) dsu.union(present[0], present[i]);
  }

  // Collect groups by root.
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const root = dsu.find(n);
    const arr = groups.get(root) ?? [];
    arr.push(n);
    groups.set(root, arr);
  }

  const result: MergeGroup[] = [];
  for (const accounts of groups.values()) {
    accounts.sort();
    result.push({ canonicalName: pickCanonical(accounts, aliasToCoach, baseOf), accounts });
  }
  result.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  return result;
}

function pickCanonical(
  accounts: string[],
  aliasToCoach: Map<string, string>,
  baseOf: Map<string, string>,
): string {
  // Prefer an existing coach profile's canonical name.
  for (const a of accounts) {
    const c = aliasToCoach.get(a);
    if (c) return c;
  }
  // Else the most common resolved base name, tie-break alphabetically.
  const freq = new Map<string, number>();
  for (const a of accounts) {
    const k = baseOf.get(a) ?? getCleanName(a);
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  return [...freq.entries()].sort(
    (x, y) => y[1] - x[1] || x[0].localeCompare(y[0]),
  )[0][0];
}
