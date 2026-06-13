import { describe, expect, it } from "vitest";
import {
  parsePeriod,
  parseScheduleSlots,
  parseTimesheetEntry,
  parseTimesheetSession,
  sessionToEntries,
} from "./validate";

describe("parsePeriod", () => {
  it("accepts YYYY-MM and rejects anything else", () => {
    expect(parsePeriod("2026-06")).toBe("2026-06");
    expect(parsePeriod(" 2026-06 ")).toBe("2026-06");
    expect(parsePeriod("2026-6")).toBeNull();
    expect(parsePeriod("2026-06-01")).toBeNull();
    expect(parsePeriod(42)).toBeNull();
  });
});

describe("parseTimesheetEntry — lesson", () => {
  it("accepts a valid lesson entry", () => {
    const r = parseTimesheetEntry({
      date: "2026-06-08",
      center: "PK",
      entryType: "lesson",
      classType: "low",
      hours: 1.5,
      note: " extra ",
    });
    expect(r).toEqual({
      value: {
        date: "2026-06-08",
        center: "PK",
        entryType: "lesson",
        classType: "low",
        startTime: null,
        endTime: null,
        hours: 1.5,
        note: "extra",
      },
    });
  });

  it("requires a valid class type and positive hours", () => {
    expect(parseTimesheetEntry({ date: "2026-06-08", center: "PK", entryType: "lesson", hours: 1 })).toEqual({
      error: "a lesson needs a valid classType",
    });
    expect(
      parseTimesheetEntry({ date: "2026-06-08", center: "PK", entryType: "lesson", classType: "low", hours: 0 }),
    ).toEqual({ error: "hours must be a positive number" });
  });

  it("rejects a bad date, missing center, or unknown entry type", () => {
    expect(parseTimesheetEntry({ date: "8 Jun", center: "PK", entryType: "lesson", classType: "low", hours: 1 })).toEqual({
      error: "date must be YYYY-MM-DD",
    });
    expect(parseTimesheetEntry({ date: "2026-06-08", center: "  ", entryType: "lesson", classType: "low", hours: 1 })).toEqual({
      error: "center is required",
    });
    expect(parseTimesheetEntry({ date: "2026-06-08", center: "PK", entryType: "nope" })).toEqual({
      error: "entryType must be 'lesson' or 'shift'",
    });
  });
});

describe("parseTimesheetEntry — shift", () => {
  it("derives hours from the span and ignores any client hours / classType", () => {
    const r = parseTimesheetEntry({
      date: "2026-06-08",
      center: "USJ",
      entryType: "shift",
      startTime: "09:00",
      endTime: "12:30",
      hours: 999, // ignored — server derives from the span
      classType: "low", // ignored for shifts
    });
    expect(r).toEqual({
      value: {
        date: "2026-06-08",
        center: "USJ",
        entryType: "shift",
        classType: null,
        startTime: "09:00",
        endTime: "12:30",
        hours: 3.5,
        note: "",
      },
    });
  });

  it("rejects malformed or non-increasing times", () => {
    expect(parseTimesheetEntry({ date: "2026-06-08", center: "USJ", entryType: "shift", startTime: "9am", endTime: "12:00" })).toEqual({
      error: "a shift needs startTime and endTime as HH:MM",
    });
    expect(parseTimesheetEntry({ date: "2026-06-08", center: "USJ", entryType: "shift", startTime: "12:00", endTime: "12:00" })).toEqual({
      error: "endTime must be after startTime",
    });
  });
});

describe("parseTimesheetSession — lesson (start/end + multiple class lines)", () => {
  it("accepts a session whose class hours sum to the start–end span", () => {
    const r = parseTimesheetSession({
      date: "2026-06-08",
      center: "PK",
      startTime: "14:00",
      endTime: "18:00",
      lines: [
        { classType: "medium", hours: 2 },
        { classType: "high", hours: 2 },
      ],
      note: "double session",
    });
    expect(r).toEqual({
      value: {
        date: "2026-06-08",
        center: "PK",
        startTime: "14:00",
        endTime: "18:00",
        lines: [
          { classType: "medium", hours: 2 },
          { classType: "high", hours: 2 },
        ],
        note: "double session",
      },
    });
  });

  it("allows the sum to be off by up to the tolerance (a short break)", () => {
    const r = parseTimesheetSession({
      date: "2026-06-08",
      center: "PK",
      startTime: "09:00",
      endTime: "11:00", // 2h span
      lines: [{ classType: "low", hours: 1.75 }], // within 0.25
    });
    expect("value" in r).toBe(true);
  });

  it("rejects when the class hours don't match the span", () => {
    const r = parseTimesheetSession({
      date: "2026-06-08",
      center: "PK",
      startTime: "09:00",
      endTime: "11:00", // 2h span
      lines: [{ classType: "low", hours: 3 }], // way over
    });
    expect("error" in r).toBe(true);
  });

  it("requires start/end, at least one line, and valid class types + hours", () => {
    expect(parseTimesheetSession({ date: "2026-06-08", center: "PK", lines: [{ classType: "low", hours: 1 }] })).toEqual({
      error: "a lesson session needs startTime and endTime as HH:MM",
    });
    expect(
      parseTimesheetSession({ date: "2026-06-08", center: "PK", startTime: "09:00", endTime: "10:00", lines: [] }),
    ).toEqual({ error: "add at least one class line" });
    expect(
      parseTimesheetSession({ date: "2026-06-08", center: "PK", startTime: "09:00", endTime: "10:00", lines: [{ classType: "nope", hours: 1 }] }),
    ).toEqual({ error: "line 1: needs a valid classType" });
    expect(
      parseTimesheetSession({ date: "2026-06-08", center: "PK", startTime: "09:00", endTime: "10:00", lines: [{ classType: "low", hours: 0 }] }),
    ).toEqual({ error: "line 1: hours must be a positive number" });
  });
});

describe("sessionToEntries — one lesson row per class line", () => {
  it("fans a session out into per-line lesson entries sharing the window", () => {
    const s = parseTimesheetSession({
      date: "2026-06-08",
      center: "PK",
      startTime: "14:00",
      endTime: "18:00",
      lines: [
        { classType: "medium", hours: 2 },
        { classType: "high", hours: 2 },
      ],
      note: "double session",
    });
    if (!("value" in s)) throw new Error("expected a valid session");
    expect(sessionToEntries(s.value)).toEqual([
      {
        date: "2026-06-08",
        center: "PK",
        entryType: "lesson",
        classType: "medium",
        startTime: "14:00",
        endTime: "18:00",
        hours: 2,
        note: "double session",
      },
      {
        date: "2026-06-08",
        center: "PK",
        entryType: "lesson",
        classType: "high",
        startTime: "14:00",
        endTime: "18:00",
        hours: 2,
        note: "double session",
      },
    ]);
  });

  it("keeps a single-line session as one entry", () => {
    const s = parseTimesheetSession({
      date: "2026-06-08",
      center: "PK",
      startTime: "09:00",
      endTime: "10:00",
      lines: [{ classType: "low", hours: 1 }],
    });
    if (!("value" in s)) throw new Error("expected a valid session");
    const entries = sessionToEntries(s.value);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ entryType: "lesson", classType: "low", hours: 1 });
  });
});

describe("parseScheduleSlots", () => {
  it("accepts a valid slot list (no class type on the schedule)", () => {
    const r = parseScheduleSlots({
      slots: [
        { weekday: 1, startTime: "17:00", endTime: "18:00", center: "PK" },
        { weekday: 3, startTime: "09:00", endTime: "17:00", center: "USJ", effectiveFrom: "2026-06-01" },
      ],
    });
    expect(r).toEqual({
      value: [
        { weekday: 1, startTime: "17:00", endTime: "18:00", center: "PK", effectiveFrom: null, effectiveTo: null },
        { weekday: 3, startTime: "09:00", endTime: "17:00", center: "USJ", effectiveFrom: "2026-06-01", effectiveTo: null },
      ],
    });
  });

  it("rejects a non-array, a bad weekday, and bad times", () => {
    expect(parseScheduleSlots({ slots: "no" })).toEqual({ error: "slots must be an array" });
    expect(parseScheduleSlots({ slots: [{ weekday: 7, startTime: "17:00", endTime: "18:00", center: "PK" }] })).toEqual({
      error: "slot 0: weekday must be 0–6",
    });
    expect(parseScheduleSlots({ slots: [{ weekday: 1, startTime: "17:00", endTime: "16:00", center: "PK" }] })).toEqual({
      error: "slot 0: endTime must be after startTime",
    });
  });
});
