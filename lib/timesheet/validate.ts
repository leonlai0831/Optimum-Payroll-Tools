// Pure validation/parsing for timesheet + schedule request bodies. Untrusted
// client input → a typed, normalized value or an error string. No DB/HTTP, so
// it's unit-locked (validate.test.ts) — payroll input must not slip through.

import {
  SLOT_TYPES,
  TIMESHEET_CLASS_TYPES,
  TIMESHEET_ENTRY_TYPES,
  type SlotType,
  type TimesheetClassType,
  type TimesheetEntryType,
} from "./types";

export interface ParsedTimesheetEntry {
  date: string;
  center: string;
  entryType: TimesheetEntryType;
  classType: TimesheetClassType | null;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  note: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isClassType(v: unknown): v is TimesheetClassType {
  return typeof v === "string" && (TIMESHEET_CLASS_TYPES as readonly string[]).includes(v);
}

/** Validate "YYYY-MM"; returns the trimmed value or null. */
export function parsePeriod(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return PERIOD_RE.test(s) ? s : null;
}

/** Optional slot-type override (admin); undefined/null → null, else validated. */
export function parseSlotType(v: unknown): SlotType | null {
  return typeof v === "string" && (SLOT_TYPES as readonly string[]).includes(v) ? (v as SlotType) : null;
}

/**
 * Parse a clock-in entry body. `lesson` requires a class type; `shift` requires
 * start/end times and no class type. Hours must be a positive, finite number;
 * for shifts the times must bracket a positive span. The work month
 * (`periodLabel`) is validated separately by the route.
 */
export function parseTimesheetEntry(body: unknown): { value: ParsedTimesheetEntry } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "body must be an object" };
  const b = body as Record<string, unknown>;

  const date = typeof b.date === "string" ? b.date.trim() : "";
  if (!DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };

  const center = typeof b.center === "string" ? b.center.trim() : "";
  if (!center) return { error: "center is required" };

  if (typeof b.entryType !== "string" || !(TIMESHEET_ENTRY_TYPES as readonly string[]).includes(b.entryType)) {
    return { error: "entryType must be 'lesson' or 'shift'" };
  }
  const entryType = b.entryType as TimesheetEntryType;

  const note = typeof b.note === "string" ? b.note.trim() : "";

  if (entryType === "lesson") {
    if (!isClassType(b.classType)) return { error: "a lesson needs a valid classType" };
    const hours = typeof b.hours === "number" ? b.hours : Number(b.hours);
    if (!Number.isFinite(hours) || hours <= 0) return { error: "hours must be a positive number" };
    return {
      value: { date, center, entryType, classType: b.classType, startTime: null, endTime: null, hours, note },
    };
  }

  // shift (front-desk freelancer): start/end times, no class type; hours are
  // DERIVED from the span (server truth), never trusted from the client.
  const startTime = typeof b.startTime === "string" ? b.startTime.trim() : "";
  const endTime = typeof b.endTime === "string" ? b.endTime.trim() : "";
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return { error: "a shift needs startTime and endTime as HH:MM" };
  }
  if (endTime <= startTime) return { error: "endTime must be after startTime" };
  const hours = (toMinutes(endTime) - toMinutes(startTime)) / 60;
  return { value: { date, center, entryType, classType: null, startTime, endTime, hours, note } };
}

/** Max allowed gap (hours) between the summed class hours and the clocked
 *  start–end span. Small tolerance for rounding / a short break. */
export const SESSION_HOURS_TOLERANCE = 0.25;

export interface ParsedTimesheetSession {
  date: string;
  center: string;
  startTime: string;
  endTime: string;
  /** One or more classes taught within the start–end window. */
  lines: { classType: TimesheetClassType; hours: number }[];
  note: string;
}

/**
 * Parse a LESSON session: a clocked start–end window with one or more
 * (classType, hours) lines taught inside it. The lines' hours must sum to the
 * window span within {@link SESSION_HOURS_TOLERANCE} — an instructor can't log
 * more (or far fewer) teaching hours than they were clocked in for. Each line is
 * persisted as its own lesson row sharing the window, so downstream
 * aggregation/reconcile is unchanged. Pure → unit-locked (payroll input).
 */
export function parseTimesheetSession(
  body: unknown,
): { value: ParsedTimesheetSession } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "body must be an object" };
  const b = body as Record<string, unknown>;

  const date = typeof b.date === "string" ? b.date.trim() : "";
  if (!DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };

  const center = typeof b.center === "string" ? b.center.trim() : "";
  if (!center) return { error: "center is required" };

  const startTime = typeof b.startTime === "string" ? b.startTime.trim() : "";
  const endTime = typeof b.endTime === "string" ? b.endTime.trim() : "";
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return { error: "a lesson session needs startTime and endTime as HH:MM" };
  }
  if (endTime <= startTime) return { error: "endTime must be after startTime" };
  const span = (toMinutes(endTime) - toMinutes(startTime)) / 60;

  const raw = b.lines;
  if (!Array.isArray(raw) || raw.length === 0) return { error: "add at least one class line" };
  const lines: { classType: TimesheetClassType; hours: number }[] = [];
  let sum = 0;
  for (const [i, item] of raw.entries()) {
    if (typeof item !== "object" || item === null) return { error: `line ${i + 1}: must be an object` };
    const li = item as Record<string, unknown>;
    if (!isClassType(li.classType)) return { error: `line ${i + 1}: needs a valid classType` };
    const hours = typeof li.hours === "number" ? li.hours : Number(li.hours);
    if (!Number.isFinite(hours) || hours <= 0) return { error: `line ${i + 1}: hours must be a positive number` };
    lines.push({ classType: li.classType, hours });
    sum += hours;
  }
  if (Math.abs(sum - span) > SESSION_HOURS_TOLERANCE) {
    return {
      error: `class hours (${sum.toFixed(2)}) must match the ${span.toFixed(2)} h between start and end`,
    };
  }

  const note = typeof b.note === "string" ? b.note.trim() : "";
  return { value: { date, center, startTime, endTime, lines, note } };
}

/**
 * Expand a parsed lesson session into one {@link ParsedTimesheetEntry} per class
 * line — each a `lesson` row sharing the session's date/center/window/note, with
 * that line's class type + hours. One row per line keeps downstream aggregation /
 * reconcile (which read classType + hours) unchanged. Pure → unit-locked.
 */
export function sessionToEntries(s: ParsedTimesheetSession): ParsedTimesheetEntry[] {
  return s.lines.map((line) => ({
    date: s.date,
    center: s.center,
    entryType: "lesson",
    classType: line.classType,
    startTime: s.startTime,
    endTime: s.endTime,
    hours: line.hours,
    note: s.note,
  }));
}

export interface ParsedScheduleSlot {
  weekday: number;
  startTime: string;
  endTime: string;
  center: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

function parseOptionalDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return DATE_RE.test(s) ? s : null;
}

/** Parse the freelancer schedule replace body: `{ slots: [...] }`. */
export function parseScheduleSlots(body: unknown): { value: ParsedScheduleSlot[] } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "body must be an object" };
  const raw = (body as Record<string, unknown>).slots;
  if (!Array.isArray(raw)) return { error: "slots must be an array" };

  const value: ParsedScheduleSlot[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item !== "object" || item === null) return { error: `slot ${i}: must be an object` };
    const s = item as Record<string, unknown>;

    const weekday = typeof s.weekday === "number" ? s.weekday : Number(s.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { error: `slot ${i}: weekday must be 0–6` };
    }
    const center = typeof s.center === "string" ? s.center.trim() : "";
    if (!center) return { error: `slot ${i}: center is required` };

    const startTime = typeof s.startTime === "string" ? s.startTime.trim() : "";
    const endTime = typeof s.endTime === "string" ? s.endTime.trim() : "";
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      return { error: `slot ${i}: startTime/endTime must be HH:MM` };
    }
    if (endTime <= startTime) return { error: `slot ${i}: endTime must be after startTime` };

    value.push({
      weekday,
      startTime,
      endTime,
      center,
      effectiveFrom: parseOptionalDate(s.effectiveFrom),
      effectiveTo: parseOptionalDate(s.effectiveTo),
    });
  }
  return { value };
}
