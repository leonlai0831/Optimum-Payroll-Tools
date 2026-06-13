import { describe, expect, it } from "vitest";
import { reconcileFreelancer, type ReconcileEntry, type ScheduleSlot } from "./reconcile";

// June 2026: the 1st is a Monday, so Mondays (weekday 1) fall on 1, 8, 15, 22, 29.
const Y = 2026;
const M = 6;
const MONDAYS = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"];

function entry(date: string, center: string, hours: number, classType: ReconcileEntry["classType"] = "low"): ReconcileEntry {
  return { date, center, hours, classType };
}

describe("reconcileFreelancer", () => {
  it("classifies an on-schedule clock-in as fixed and a missed slot as absent", () => {
    const schedule: ScheduleSlot[] = [{ weekday: 1, center: "PK", classType: "low" }];
    // Attend only 4 of the 5 scheduled Mondays.
    const entries = MONDAYS.slice(0, 4).map((d) => entry(d, "PK", 2));

    const { centerRows, absences } = reconcileFreelancer(schedule, entries, Y, M);

    expect(centerRows).toEqual([{ center: "PK", fixedHours: 8, replacedHours: 0, absent: true }]);
    expect(absences).toEqual([{ date: "2026-06-29", center: "PK", classType: "low" }]);
  });

  it("when every scheduled occurrence is attended there is no absence", () => {
    const schedule: ScheduleSlot[] = [{ weekday: 1, center: "PK", classType: "low" }];
    const entries = MONDAYS.map((d) => entry(d, "PK", 2));

    const { centerRows, absences } = reconcileFreelancer(schedule, entries, Y, M);

    expect(centerRows).toEqual([{ center: "PK", fixedHours: 10, replacedHours: 0, absent: false }]);
    expect(absences).toEqual([]);
  });

  it("treats off-schedule and unscheduled clock-ins as replaced", () => {
    // No schedule at all → everything is a replacement, nothing is absent.
    const { centerRows, absences } = reconcileFreelancer([], [entry("2026-06-02", "PK", 3)], Y, M);
    expect(centerRows).toEqual([{ center: "PK", fixedHours: 0, replacedHours: 3, absent: false }]);
    expect(absences).toEqual([]);
  });

  it("requires the class type to match (different type on a scheduled day = replaced + absence)", () => {
    const schedule: ScheduleSlot[] = [{ weekday: 1, center: "PK", classType: "low" }];
    // Taught "high" on every scheduled Monday — none match the "low" slots.
    const entries = MONDAYS.map((d) => entry(d, "PK", 2, "high"));

    const { centerRows } = reconcileFreelancer(schedule, entries, Y, M);

    // 10h of "high" are replacements; all 5 "low" slots missed → absent.
    expect(centerRows).toEqual([{ center: "PK", fixedHours: 0, replacedHours: 10, absent: true }]);
  });

  it("matches front-desk shifts (no class type) on date + center", () => {
    const schedule: ScheduleSlot[] = [{ weekday: 1, center: "USJ", classType: null }];
    const entries: ReconcileEntry[] = MONDAYS.map((d) => ({ date: d, center: "usj", hours: 8, classType: null }));

    const { centerRows, absences } = reconcileFreelancer(schedule, entries, Y, M);

    expect(centerRows).toEqual([{ center: "USJ", fixedHours: 40, replacedHours: 0, absent: false }]);
    expect(absences).toEqual([]);
  });

  it("consumes occurrences greedily — extra same-slot clock-ins overflow to replaced", () => {
    // Two identical Monday slots → 2 fixed occurrences per Monday (10 total).
    const schedule: ScheduleSlot[] = [
      { weekday: 1, center: "PK", classType: "low" },
      { weekday: 1, center: "PK", classType: "low" },
    ];
    // Three "low" classes on the first Monday: 2 fixed, 1 replaced.
    const entries = [entry("2026-06-01", "PK", 1), entry("2026-06-01", "PK", 1), entry("2026-06-01", "PK", 1)];

    const { centerRows } = reconcileFreelancer(schedule, entries, Y, M);

    // fixed = 2h (two slots filled), replaced = 1h, and the remaining 8 slots
    // (Mon 8/15/22/29 × 2) are missed → absent.
    expect(centerRows).toEqual([{ center: "PK", fixedHours: 2, replacedHours: 1, absent: true }]);
  });
});
