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
      { weekday: 3, startTime: "09:00", endTime: "17:00", center: "USJ", effectiveFrom: null, effectiveTo: null },
      { weekday: 1, startTime: "17:00", endTime: "18:00", center: "PK", effectiveFrom: null, effectiveTo: null },
    ]);
    let slots = await queries.listFreelancerSchedule(21);
    // Ordered by weekday then startTime → Monday(1) first.
    expect(slots.map((s) => [s.weekday, s.center])).toEqual([
      [1, "PK"],
      [3, "USJ"],
    ]);

    // Replacing again wipes the prior set (no accumulation).
    await queries.replaceFreelancerSchedule(21, [
      { weekday: 5, startTime: "10:00", endTime: "11:00", center: "HQ", effectiveFrom: null, effectiveTo: null },
    ]);
    slots = await queries.listFreelancerSchedule(21);
    expect(slots).toHaveLength(1);
    expect(slots[0].center).toBe("HQ");
    expect(slots[0].weekday).toBe(5);
  });

  it("persists the note and surfaces only submitted entries to the review queue", async () => {
    // Own period so earlier tests' 2026-06 submissions don't leak in.
    const a = await queries.createTimesheetEntry(
      lesson({ coachId: 31, periodLabel: "2026-09", date: "2026-09-08", note: "covered for Sam" }),
    );
    await queries.createTimesheetEntry(lesson({ coachId: 32, periodLabel: "2026-09", date: "2026-09-09" }));
    // Drafts are not in the queue.
    expect(await queries.listTimesheetsForReview({ periodLabel: "2026-09" })).toHaveLength(0);

    await queries.submitTimesheetsForPeriod(31, "2026-09");
    await queries.submitTimesheetsForPeriod(32, "2026-09");
    const queue = await queries.listTimesheetsForReview({ periodLabel: "2026-09" });
    expect(queue.map((e) => e.coachId).sort()).toEqual([31, 32]);
    expect(queue.find((e) => e.id === a.id)!.note).toBe("covered for Sam");
  });

  it("batch-reviews only submitted entries and skips stale ids", async () => {
    const e1 = await queries.createTimesheetEntry(lesson({ coachId: 33, periodLabel: "2026-10", date: "2026-10-08" }));
    const e2 = await queries.createTimesheetEntry(lesson({ coachId: 33, periodLabel: "2026-10", date: "2026-10-10" }));
    await queries.submitTimesheetsForPeriod(33, "2026-10");

    const approved = await queries.reviewTimesheets([e1.id, e2.id], "approve", "", 99);
    expect(approved).toBe(2);
    expect((await queries.getTimesheetEntry(e1.id))!.status).toBe("approved");
    expect((await queries.getTimesheetEntry(e1.id))!.reviewedBy).toBe(99);
    // Re-reviewing already-approved ids is a no-op (guarded to `submitted`).
    expect(await queries.reviewTimesheets([e1.id, e2.id], "request_changes", "redo", 99)).toBe(0);
    expect((await queries.getTimesheetEntry(e1.id))!.status).toBe("approved");
  });

  it("scopes the review queue, count, and batch-review to the reviewer's centers", async () => {
    const period = "2026-12";
    const pk = await queries.createTimesheetEntry(
      lesson({ coachId: 51, periodLabel: period, date: "2026-12-01", center: "PK" }),
    );
    const usj = await queries.createTimesheetEntry(
      lesson({ coachId: 52, periodLabel: period, date: "2026-12-02", center: "USJ" }),
    );
    await queries.submitTimesheetsForPeriod(51, period);
    await queries.submitTimesheetsForPeriod(52, period);

    // Unscoped (omit centers) sees both; scoping to PK sees only the PK entry.
    const all = await queries.listTimesheetsForReview({ periodLabel: period });
    expect(all.map((e) => e.center).sort()).toEqual(["PK", "USJ"]);
    const pkOnly = await queries.listTimesheetsForReview({ periodLabel: period, centers: ["PK"] });
    expect(pkOnly.map((e) => e.id)).toEqual([pk.id]);

    // The count respects the same center filter.
    expect(await queries.countTimesheetsForReview(period)).toBe(2);
    expect(await queries.countTimesheetsForReview(period, ["PK"])).toBe(1);

    // A PK-only reviewer batch-approving both ids flips ONLY the PK entry —
    // the out-of-scope USJ id is skipped (defense-in-depth on the write path).
    const reviewed = await queries.reviewTimesheets([pk.id, usj.id], "approve", "", 1, ["PK"]);
    expect(reviewed).toBe(1);
    expect((await queries.getTimesheetEntry(pk.id))!.status).toBe("approved");
    expect((await queries.getTimesheetEntry(usj.id))!.status).toBe("submitted");
  });

  it("loads only APPROVED teaching hours into allowance teachingRows", async () => {
    const e1 = await queries.createTimesheetEntry(lesson({ coachId: 41, periodLabel: "2026-11", date: "2026-11-02", classType: "low", hours: 2 }));
    const e2 = await queries.createTimesheetEntry(lesson({ coachId: 41, periodLabel: "2026-11", date: "2026-11-03", classType: "youngSwimmer", hours: 1 }));
    // A third entry stays submitted (unapproved) → must not count.
    await queries.createTimesheetEntry(lesson({ coachId: 41, periodLabel: "2026-11", date: "2026-11-04", classType: "high", hours: 5 }));
    await queries.submitTimesheetsForPeriod(41, "2026-11");
    await queries.reviewTimesheets([e1.id, e2.id], "approve", "", 1);

    expect(await queries.getApprovedTeachingRows(41, "2026-11")).toEqual([
      { center: "PK", normalH: 2, ysH: 1, precompH: 0 },
    ]);
  });

  it("loads approved freelancer hours reconciled against the fixed schedule", async () => {
    // Monday PK low; June 2026 has 5 Mondays (1/8/15/22/29).
    await queries.replaceFreelancerSchedule(42, [
      { weekday: 1, startTime: "17:00", endTime: "18:00", center: "PK", effectiveFrom: null, effectiveTo: null },
    ]);
    const e = await queries.createTimesheetEntry(lesson({ coachId: 42, periodLabel: "2026-06", date: "2026-06-08", classType: "low", hours: 2 }));
    await queries.submitTimesheetsForPeriod(42, "2026-06");
    await queries.reviewTimesheets([e.id], "approve", "", 1);

    const { centerRows } = await queries.getApprovedFreelancerRows(42, "2026-06");
    const pk = centerRows.find((r) => r.center === "PK")!;
    expect(pk.fixedHours).toBe(2);
    expect(pk.absent).toBe(true); // the other 4 scheduled Mondays were missed
  });
});
