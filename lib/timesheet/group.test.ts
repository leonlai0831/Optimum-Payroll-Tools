import { describe, expect, it } from "vitest";
import { groupSessionWindows, type GroupableEntry } from "./group";

function row(over: Partial<GroupableEntry> & { id: number }): GroupableEntry {
  return {
    date: "2026-06-08",
    center: "PK",
    entryType: "lesson",
    classType: "low",
    startTime: "09:00",
    endTime: "11:00",
    hours: 1,
    ...over,
  };
}

describe("groupSessionWindows", () => {
  it("collapses the per-line rows of one window into a single record", () => {
    const wins = groupSessionWindows([
      row({ id: 1, classType: "low", hours: 1 }),
      row({ id: 2, classType: "medium", hours: 1 }),
    ]);
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({
      date: "2026-06-08",
      center: "PK",
      startTime: "09:00",
      endTime: "11:00",
      hours: 2,
      ids: [1, 2],
    });
    expect(wins[0].rows.map((r) => r.classType)).toEqual(["low", "medium"]);
  });

  it("does not merge windows that differ by time, center, or date", () => {
    const wins = groupSessionWindows([
      row({ id: 1, startTime: "09:00", endTime: "11:00" }),
      row({ id: 2, startTime: "14:00", endTime: "16:00" }), // later window, same day
      row({ id: 3, center: "USJ" }), // different center, same 09–11 window
    ]);
    expect(wins.map((w) => w.ids)).toEqual([[1], [2], [3]]);
  });

  it("keeps a shift and a window-less lesson as their own single records", () => {
    const wins = groupSessionWindows([
      row({ id: 1, entryType: "shift", classType: null, startTime: "09:00", endTime: "17:00", hours: 8 }),
      row({ id: 2, startTime: null, endTime: null }), // legacy lesson, no window
      row({ id: 3, startTime: null, endTime: null }),
    ]);
    // None share a key — three standalone records.
    expect(wins.map((w) => w.ids)).toEqual([[1], [2], [3]]);
  });

  it("splits a window whose rows differ by the extra key (e.g. status)", () => {
    const wins = groupSessionWindows(
      [
        row({ id: 1, classType: "low" }),
        row({ id: 2, classType: "medium" }),
        row({ id: 3, classType: "high" }),
      ].map((r, i) => ({ ...r, status: i === 2 ? "approved" : "submitted" })) as (GroupableEntry & {
        status: string;
      })[],
      (r) => (r as GroupableEntry & { status: string }).status,
    );
    // The two `submitted` lines group; the lone `approved` line splits off.
    expect(wins.map((w) => w.ids)).toEqual([[1, 2], [3]]);
  });

  it("preserves first-seen window order but sorts rows within a window by id", () => {
    const wins = groupSessionWindows([
      row({ id: 5, startTime: "14:00", endTime: "15:00" }), // window B seen first
      row({ id: 2, startTime: "09:00", endTime: "10:00" }), // window A
      row({ id: 9, startTime: "14:00", endTime: "15:00" }), // window B again
    ]);
    expect(wins.map((w) => w.startTime)).toEqual(["14:00", "09:00"]);
    expect(wins[0].ids).toEqual([5, 9]); // sorted ascending within the window
  });
});
