import { describe, expect, it } from "vitest";
import { aggregateTeaching, type TimesheetEntry } from "./aggregate";
import { teachingBucketOf } from "./types";

function lesson(center: string, classType: TimesheetEntry["classType"], hours: number): TimesheetEntry {
  return { center, entryType: "lesson", classType, hours };
}

describe("teachingBucketOf", () => {
  it("folds the 7 class types into the 3 allowance buckets", () => {
    expect(teachingBucketOf("low")).toBe("normal");
    expect(teachingBucketOf("medium")).toBe("normal");
    expect(teachingBucketOf("high")).toBe("normal");
    expect(teachingBucketOf("adult")).toBe("normal");
    expect(teachingBucketOf("youngSwimmer")).toBe("youngSwimmer");
    expect(teachingBucketOf("precomp")).toBe("precompLifesaving");
    expect(teachingBucketOf("lifesaving")).toBe("precompLifesaving");
  });
});

describe("aggregateTeaching", () => {
  it("sums hours per center into the three buckets", () => {
    const rows = aggregateTeaching([
      lesson("HQ", "low", 2),
      lesson("HQ", "high", 1.5),
      lesson("HQ", "adult", 1),
      lesson("HQ", "youngSwimmer", 3),
      lesson("HQ", "precomp", 2),
      lesson("HQ", "lifesaving", 1),
    ]);
    expect(rows).toEqual([{ center: "HQ", normalH: 4.5, ysH: 3, precompH: 3 }]);
  });

  it("groups by center (case-insensitive), emits the canonical code, keeps order", () => {
    const rows = aggregateTeaching([
      lesson("PK", "low", 2),
      lesson("HQ", "medium", 1),
      lesson("pk", "high", 3), // same center as PK
    ]);
    expect(rows).toEqual([
      { center: "PK", normalH: 5, ysH: 0, precompH: 0 },
      { center: "HQ", normalH: 1, ysH: 0, precompH: 0 },
    ]);
  });

  it("ignores shift and class-less entries (front-desk hours don't feed teaching)", () => {
    const rows = aggregateTeaching([
      { center: "USJ", entryType: "shift", hours: 8 },
      { center: "USJ", entryType: "lesson", classType: null, hours: 2 },
      lesson("USJ", "low", 2),
    ]);
    expect(rows).toEqual([{ center: "USJ", normalH: 2, ysH: 0, precompH: 0 }]);
  });

  it("returns an empty array when there are no teaching entries", () => {
    expect(aggregateTeaching([{ center: "HQ", entryType: "shift", hours: 5 }])).toEqual([]);
  });
});
