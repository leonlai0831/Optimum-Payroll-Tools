import { beforeAll, describe, expect, it } from "vitest";

// In-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

import { overallFromRatings, type AppraisalRating } from "./types";

describe("overallFromRatings", () => {
  it("maps 1–5 ratings to a 0–100 mean", () => {
    expect(overallFromRatings([])).toBe(0);
    expect(overallFromRatings([{ key: "a", label: "A", score: 5 }])).toBe(100);
    expect(overallFromRatings([{ key: "a", label: "A", score: 3 }])).toBe(60);
    expect(
      overallFromRatings([
        { key: "a", label: "A", score: 4 },
        { key: "b", label: "B", score: 2 },
      ]),
    ).toBe(60);
  });
});

describe("appraisals DB layer (PGlite in-memory)", () => {
  let q: typeof import("../db/queries");
  let coachId: number;
  beforeAll(async () => {
    q = await import("../db/queries");
    const coach = await q.createCoach({ canonicalName: "APPRAISEE", jobRole: "instructor" });
    coachId = coach.id;
  });

  it("seeds default appraisal dimensions and round-trips edits", async () => {
    const cfg = await q.getPerformanceConfig();
    expect(cfg.dimensions.length).toBeGreaterThanOrEqual(5);
    await q.savePerformanceConfig({ dimensions: [{ key: "x", label: "X" }] });
    expect((await q.getPerformanceConfig()).dimensions).toEqual([{ key: "x", label: "X" }]);
  });

  it("creates, lists, and deletes appraisals and tracks the latest overall", async () => {
    const ratings: AppraisalRating[] = [{ key: "x", label: "X", score: 4 }];
    await q.createAppraisal({
      coachId,
      periodLabel: "2026 H1",
      reviewDate: new Date("2026-01-15"),
      reviewedBy: "admin@local",
      ratings,
      overallScore: overallFromRatings(ratings),
      comments: "solid",
    });
    const a2 = await q.createAppraisal({
      coachId,
      periodLabel: "2026 H2",
      reviewDate: new Date("2026-07-15"),
      reviewedBy: "admin@local",
      ratings: [{ key: "x", label: "X", score: 5 }],
      overallScore: 100,
      comments: "",
    });

    const list = await q.listAppraisalsForCoach(coachId);
    expect(list.length).toBe(2);
    expect(list[0].periodLabel).toBe("2026 H2"); // newest reviewDate first

    expect((await q.getLatestAppraisalOverallByCoach()).get(coachId)).toBe(100);

    await q.deleteAppraisal(a2.id);
    expect((await q.listAppraisalsForCoach(coachId)).length).toBe(1);
    expect((await q.getLatestAppraisalOverallByCoach()).get(coachId)).toBe(
      overallFromRatings(ratings),
    );
  });
});
