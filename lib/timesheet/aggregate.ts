// Full-time instructor teaching hours → allowance `teachingRows`.
// Pure; locked by aggregate.test.ts.

import type { TeachingHoursRow } from "@/lib/allowance/types";
import { teachingBucketOf, type TimesheetClassType, type TimesheetEntryType } from "./types";

/** An already-approved clock-in entry, reduced to what aggregation needs. */
export interface TimesheetEntry {
  center: string;
  entryType: TimesheetEntryType;
  classType?: TimesheetClassType | null;
  hours: number;
}

/** Group key for a center — trimmed + upper-cased, matching the
 *  case-insensitive center handling in the freelancer/allowance engines. */
function centerKey(center: string): string {
  return center.trim().toUpperCase();
}

/**
 * Fold a month of approved `lesson` entries into allowance teaching rows:
 * grouped by center, the 7 class types collapsed into the 3 rate buckets
 * (normalH / ysH / precompH). `shift` and class-less entries are ignored
 * (front-desk hours don't feed the teaching allowance). Centers group
 * case-insensitively; the output uses the canonical (trimmed, upper-cased)
 * center code; input order is preserved.
 */
export function aggregateTeaching(entries: TimesheetEntry[]): TeachingHoursRow[] {
  const byCenter = new Map<string, TeachingHoursRow>();
  const order: string[] = [];
  for (const e of entries) {
    if (e.entryType !== "lesson" || !e.classType) continue;
    const key = centerKey(e.center);
    let row = byCenter.get(key);
    if (!row) {
      row = { center: key, normalH: 0, ysH: 0, precompH: 0 };
      byCenter.set(key, row);
      order.push(key);
    }
    const bucket = teachingBucketOf(e.classType);
    if (bucket === "normal") row.normalH += e.hours;
    else if (bucket === "youngSwimmer") row.ysH += e.hours;
    else row.precompH += e.hours;
  }
  return order.map((k) => byCenter.get(k)!);
}
