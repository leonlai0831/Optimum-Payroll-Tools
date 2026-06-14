// Collapse the flat timesheet rows back into the clocked windows a coach
// actually filed. A lesson SESSION persists as one row per class line sharing
// (date, center, start, end) (see validate.ts → sessionToEntries); the UI and
// the review/delete actions, however, work on the WHOLE window — so this groups
// the per-line rows back into one displayed record. Pure → unit-locked (group.test.ts).

import type { TimesheetClassType, TimesheetEntryType } from "./types";

/** The minimum a row needs to be grouped into a session window. */
export interface GroupableEntry {
  id: number;
  date: string;
  center: string;
  entryType: TimesheetEntryType;
  classType: TimesheetClassType | null;
  startTime: string | null;
  endTime: string | null;
  hours: number;
}

/** One displayed record: a clocked lesson window (with its class lines) or a
 *  standalone row (a shift, or a legacy lesson with no start/end window). */
export interface SessionWindow<T extends GroupableEntry> {
  key: string;
  date: string;
  center: string;
  entryType: TimesheetEntryType;
  startTime: string | null;
  endTime: string | null;
  /** Sum of the window's rows' hours. */
  hours: number;
  /** Every row id in the window — coach delete / reviewer approve act on all. */
  ids: number[];
  /** The window's rows, ordered by id ascending (≈ insertion order). */
  rows: T[];
}

/**
 * Group flat rows into session windows. Only a `lesson` row carrying BOTH a
 * start and end time is grouped — by (date, center, start, end); a shift, or a
 * legacy lesson with no window, stays its own single-row record. Two lesson
 * rows can share that key only when they are the SAME clocked window (a coach
 * can't be in two identical windows at one center at once), so the grouping is
 * lossless. `extraKey` (e.g. a row's status) refines the key so rows that must
 * not merge — a half-reviewed window — split into separate records. Output
 * windows follow first-seen order; rows inside a window are ordered by id asc.
 */
export function groupSessionWindows<T extends GroupableEntry>(
  rows: T[],
  extraKey: (r: T) => string = () => "",
): SessionWindow<T>[] {
  const byKey = new Map<string, SessionWindow<T>>();
  const order: string[] = [];
  for (const r of rows) {
    const groupable = r.entryType === "lesson" && r.startTime != null && r.endTime != null;
    const key = groupable
      ? `w|${r.date}|${r.center}|${r.startTime}|${r.endTime}|${extraKey(r)}`
      : `s|${r.id}`;
    let win = byKey.get(key);
    if (!win) {
      win = {
        key,
        date: r.date,
        center: r.center,
        entryType: r.entryType,
        startTime: r.startTime,
        endTime: r.endTime,
        hours: 0,
        ids: [],
        rows: [],
      };
      byKey.set(key, win);
      order.push(key);
    }
    win.hours += r.hours;
    win.ids.push(r.id);
    win.rows.push(r);
  }
  for (const win of byKey.values()) {
    win.rows.sort((a, b) => a.id - b.id);
    win.ids.sort((a, b) => a - b);
  }
  return order.map((k) => byKey.get(k)!);
}
