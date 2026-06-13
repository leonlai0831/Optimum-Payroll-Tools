import { beforeAll, describe, expect, it } from "vitest";

// In-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

import type { TimesheetEntryInput } from "../db/queries";

describe("Timesheet DB layer (PGlite in-memory)", () => {
  let queries: typeof import("../db/queries");

  beforeAll(async () => {
    queries = await import("../db/queries");
  });

  function lesson(over: Partial<TimesheetEntryInput> = {}): TimesheetEntryInput {
    return {
      coachId: 1,
      periodLabel: "2026-06",
      date: "2026-06-08",
      center: "PK",
      entryType: "lesson",
      classType: "low",
      startTime: null,
      endTime: null,
      hours: 2,
      note: "",
      ...over,
    };
  }

  it("creates a draft entry and lists it for the coach", async () => {
    const row = await queries.createTimesheetEntry(lesson({ coachId: 11 }));
    expect(row.id).toBeGreaterThan(0);
    expect(row.status).toBe("draft");
    expect(row.hours).toBe(2);

    const list = await queries.listTimesheetsForCoach(11, "2026-06");
    expect(list.map((e) => e.id)).toContain(row.id);
    // Filtering by another month excludes it.
    expect(await queries.listTimesheetsForCoach(11, "2026-05")).toHaveLength(0);
  });

  it("resets an entry to draft on edit", async () => {
    const row = await queries.createTimesheetEntry(lesson({ coachId: 12 }));
    await queries.submitTimesheetsForPeriod(12, "2026-06");
    expect((await queries.getTimesheetEntry(row.id))!.status).toBe("submitted");

    await queries.updateTimesheetEntry(row.id, lesson({ coachId: 12, hours: 3 }));
    const after = await queries.getTimesheetEntry(row.id);
    expect(after!.status).toBe("draft");
    expect(after!.hours).toBe(3);
  });

  it("submits only draft/changes_requested entries and counts them", async () => {
    await queries.createTimesheetEntry(lesson({ coachId: 13, date: "2026-06-01" }));
    await queries.createTimesheetEntry(lesson({ coachId: 13, date: "2026-06-02" }));

    const first = await queries.submitTimesheetsForPeriod(13, "2026-06");
    expect(first).toBe(2);
    // Nothing left in a submittable state → a second submit is a no-op.
    const second = await queries.submitTimesheetsForPeriod(13, "2026-06");
    expect(second).toBe(0);
  });

  it("replaces a freelancer's whole schedule and lists it ordered", async () => {
    await queries.replaceFreelancerSchedule(21, [
      { weekday: 3, startTime: "09:00", endTime: "17:00", center: "USJ", classType: null, effectiveFrom: null, effectiveTo: null },
      { weekday: 1, startTime: "17:00", endTime: "18:00", center: "PK", classType: "low", effectiveFrom: null, effectiveTo: null },
    ]);
    let slots = await queries.listFreelancerSchedule(21);
    // Ordered by weekday then startTime → Monday(1) first.
    expect(slots.map((s) => [s.weekday, s.center])).toEqual([
      [1, "PK"],
      [3, "USJ"],
    ]);

    // Replacing again wipes the prior set (no accumulation).
    await queries.replaceFreelancerSchedule(21, [
      { weekday: 5, startTime: "10:00", endTime: "11:00", center: "HQ", classType: "high", effectiveFrom: null, effectiveTo: null },
    ]);
    slots = await queries.listFreelancerSchedule(21);
    expect(slots).toHaveLength(1);
    expect(slots[0].center).toBe("HQ");
    expect(slots[0].classType).toBe("high");
  });
});
