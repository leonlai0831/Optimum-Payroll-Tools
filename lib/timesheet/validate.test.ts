import { describe, expect, it } from "vitest";
import { parsePeriod, parseScheduleSlots, parseTimesheetEntry } from "./validate";

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

describe("parseScheduleSlots", () => {
  it("accepts a valid slot list", () => {
    const r = parseScheduleSlots({
      slots: [
        { weekday: 1, startTime: "17:00", endTime: "18:00", center: "PK", classType: "low" },
        { weekday: 3, startTime: "09:00", endTime: "17:00", center: "USJ", classType: null, effectiveFrom: "2026-06-01" },
      ],
    });
    expect(r).toEqual({
      value: [
        { weekday: 1, startTime: "17:00", endTime: "18:00", center: "PK", classType: "low", effectiveFrom: null, effectiveTo: null },
        { weekday: 3, startTime: "09:00", endTime: "17:00", center: "USJ", classType: null, effectiveFrom: "2026-06-01", effectiveTo: null },
      ],
    });
  });

  it("rejects a non-array, a bad weekday, bad times, and an invalid class type", () => {
    expect(parseScheduleSlots({ slots: "no" })).toEqual({ error: "slots must be an array" });
    expect(parseScheduleSlots({ slots: [{ weekday: 7, startTime: "17:00", endTime: "18:00", center: "PK" }] })).toEqual({
      error: "slot 0: weekday must be 0–6",
    });
    expect(parseScheduleSlots({ slots: [{ weekday: 1, startTime: "17:00", endTime: "16:00", center: "PK" }] })).toEqual({
      error: "slot 0: endTime must be after startTime",
    });
    expect(parseScheduleSlots({ slots: [{ weekday: 1, startTime: "17:00", endTime: "18:00", center: "PK", classType: "xx" }] })).toEqual({
      error: "slot 0: invalid classType",
    });
  });
});
