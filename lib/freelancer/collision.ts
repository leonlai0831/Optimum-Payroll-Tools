// Duplicate-save detection for the freelancer calculator. The DB upserts on
// (periodLabel, canonicalName, positionGroup, workPeriod) — see
// `upsertFreelancerRun` — so saving never errors on a duplicate: a same-key
// save silently REPLACES the existing record, and a different position family
// or work month silently ADDS a second record for the same person+month.
// This classifier tells the UI which of those is about to happen so it can
// ask before submitting.

import { positionGroupOf, type FreelancerPosition } from "./types";

/** The fields of a saved record the duplicate check needs (subset of FreelancerRunSummary). */
export interface ExistingRunKey {
  id: number;
  canonicalName: string;
  position: FreelancerPosition;
  /** Effective work month (the payout month unless it was a late submission). */
  workPeriod: string;
  grandTotal: number;
}

export type SaveCollision =
  /** No same-person record in the payout month (or the only match is the record being edited). */
  | { kind: "none" }
  /** A record with the same (person, position family, work month) exists — saving overwrites IT. */
  | { kind: "replace"; existing: ExistingRunKey }
  /** Same-person records exist but none share the key — saving adds another record for the month. */
  | { kind: "second"; existing: ExistingRunKey[] };

export function classifySaveCollision(
  target: {
    name: string;
    position: FreelancerPosition;
    /** Effective work month of the save: `input.workPeriod || periodLabel`. */
    workPeriod: string;
    /** When editing, the id of the opened record — replacing ITSELF is the normal edit path. */
    editingRunId?: number | null;
  },
  /** Saved records of the same payout month (any person). */
  existingInPeriod: ExistingRunKey[],
): SaveCollision {
  const group = positionGroupOf(target.position);
  const samePerson = existingInPeriod.filter((r) => r.canonicalName === target.name);
  const exact = samePerson.find(
    (r) => positionGroupOf(r.position) === group && r.workPeriod === target.workPeriod,
  );
  if (exact) {
    return exact.id === target.editingRunId ? { kind: "none" } : { kind: "replace", existing: exact };
  }
  // No same-key record: the save INSERTS. When editing, the opened record keeps
  // its old key and stays behind, so it counts among the records that remain.
  if (samePerson.length > 0) return { kind: "second", existing: samePerson };
  return { kind: "none" };
}
