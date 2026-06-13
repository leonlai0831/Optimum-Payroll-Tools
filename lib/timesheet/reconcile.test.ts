import { describe, expect, it } from "vitest";
import { reconcileFreelancer, type ReconcileEntry, type ScheduleSlot } from "./reconcile";

// June 2026: the 1st is a Monday, so Mondays (weekday 1) fall on 1, 8, 15, 22, 29.
const Y = 2026;
const M = 6;
const MONDAYS = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"];

function entry(date: string, center: string, hours: number): ReconcileEntry {
  return { date, center, hours };
}

describe("reconcileFreelancer", () => {
  it("classifies an on-schedule clock-in as fixed and a missed slot as absent", () => {
    const schedule: ScheduleSlot[] = [{ weekday: 1, center: "PK" }];
    // Attend only 4 of the 5 scheduled Mondays.
    const entries = MONDAYS.slice(0, 4).map((d) => entry(d, "PK", 2));

    const { centerRows, absences } = reconcileFreelancer(schedule, entries, Y, M);

    expect(centerRows).toEqual([{ center: "PK", fixedHours: 8, replacedHours: 0, absent: true }]);
    expect(absences).toEqual([{ date: "2026-06-29", center: "PK" }]);
  });

  it("when every scheduled occurrence is attended there is no absence", () => {
    const schedule: ScheduleSlot[] = [{ weekday: 1, center: "PK" }];
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

  it("matches on the scheduled DATE only — covering at another center still counts as fixed", () => {
    const schedule: ScheduleSlot[] = [{ weekday: 1, center: "PK" }];
    // Scheduled Monday at PK, but the freelancer covered at HQ that Monday →
    // still FIXED (the date matches) and the hours land on HQ. A Tuesday clock-in
    // is off-schedule → replaced.
    const { centerRows } = reconcileFreelancer(
      schedule,
      [entry("2026-06-08", "HQ", 2), entry("2026-06-09", "USJ", 1)],
      Y,
      M,
    );
    expect(centerRows).toEqual([
      { center: "HQ", fixedHours: 2, replacedHours: 0, absent: false },
      { center: "USJ", fixedHours: 0, replacedHours: 1, absent: false },
      // The other 4 scheduled Mondays were missed → PK marked absent (0h).
      { center: "PK", fixedHours: 0, replacedHours: 0, absent: true },
    ]);
  });

  it("matches case-insensitively on center (front-desk shift, no class anywhere)", () => {
    const schedule: ScheduleSlot[] = [{ weekday: 1, center: "USJ" }];
    const entries = MONDAYS.map((d) => entry(d, "usj", 8));

    const { centerRows, absences } = reconcileFreelancer(schedule, entries, Y, M);

    expect(centerRows).toEqual([{ center: "USJ", fixedHours: 40, replacedHours: 0, absent: false }]);
    expect(absences).toEqual([]);
  });

  it("consumes occurrences greedily — extra same-slot clock-ins overflow to replaced", () => {
    // Two Monday slots at PK → 2 fixed occurrences per Monday (10 total).
    const schedule: ScheduleSlot[] = [
      { weekday: 1, center: "PK" },
      { weekday: 1, center: "PK" },
    ];
    // Three classes on the first Monday: 2 fixed, 1 replaced.
    const entries = [entry("2026-06-01", "PK", 1), entry("2026-06-01", "PK", 1), entry("2026-06-01", "PK", 1)];

    const { centerRows } = reconcileFreelancer(schedule, entries, Y, M);

    // fixed = 2h (two slots filled), replaced = 1h, and the remaining 8 slots
    // (Mon 8/15/22/29 × 2) are missed → absent.
    expect(centerRows).toEqual([{ center: "PK", fixedHours: 2, replacedHours: 1, absent: true }]);
  });
});
