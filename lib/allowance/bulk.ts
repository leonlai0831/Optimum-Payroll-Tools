import type { AllowanceInput, AllowanceTier, TeachingHoursRow } from "./types";

/** One staff member's row in the bulk-by-center entry table. */
export interface BulkRow {
  coachId: number | null;
  name: string;
  tier: AllowanceTier;
  /** The center this bulk batch is for. */
  center: string;
  opHours: number;
  leaveHours: number;
  normalH: number;
  ysH: number;
  precompH: number;
}

const hasHours = (r: Pick<BulkRow, "normalH" | "ysH" | "precompH">) =>
  r.normalH > 0 || r.ysH > 0 || r.precompH > 0;

/**
 * Merge one center's bulk-entered row into a staff member's existing monthly
 * record (or build a fresh one). Critically, this preserves the multi-center
 * invariant: only the *selected center's* teaching row and the staff-level
 * attendance/tier are replaced — teaching rows for OTHER centers and any other
 * allowance items are kept untouched. So a manager bulk-entering center B can't
 * wipe the hours another manager already saved for center A.
 */
export function mergeBulkRow(row: BulkRow, existing: AllowanceInput | null): AllowanceInput {
  const target = row.center.trim();
  const base: AllowanceInput = existing ?? {
    coachId: row.coachId,
    name: row.name,
    tier: row.tier,
    center: target,
    opHours: 0,
    leaveHours: 0,
    teachingRows: [],
    otherItems: [],
  };

  // Keep other centers' teaching rows; replace this center's with the new hours.
  const otherCenters = base.teachingRows.filter((t) => t.center.trim() !== target);
  const thisCenter: TeachingHoursRow[] = hasHours(row)
    ? [{ center: target, normalH: row.normalH, ysH: row.ysH, precompH: row.precompH }]
    : [];
  const teachingRows = [...otherCenters, ...thisCenter];
  const center = [...new Set(teachingRows.map((t) => t.center.trim()).filter(Boolean))].join(", ");

  return {
    ...base,
    coachId: base.coachId ?? row.coachId,
    name: row.name.trim(),
    tier: row.tier,
    opHours: row.opHours,
    leaveHours: row.leaveHours,
    teachingRows,
    center: center || target,
    otherItems: base.otherItems,
  };
}

/** Pull the selected center's teaching hours back out of a saved record, to
 * prefill the bulk table when re-opening a center that's already been entered. */
export function extractCenterHours(
  input: AllowanceInput | null,
  center: string,
): { normalH: number; ysH: number; precompH: number } {
  const target = center.trim();
  const row = input?.teachingRows.find((t) => t.center.trim() === target);
  return {
    normalH: row?.normalH ?? 0,
    ysH: row?.ysH ?? 0,
    precompH: row?.precompH ?? 0,
  };
}
