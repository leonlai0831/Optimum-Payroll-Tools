import { describe, it, expect } from "vitest";
import { computeAssessment, gradeFor } from "./calc";
import type { RatingMap } from "./types";

// The worked example from the owner's Google Sheet ("Evi's Copy"). Part 2 was
// left unrated (so it scores 0), which drags the Final down to Underperforming
// even though Part 1 alone is Proficient.
const EXAMPLE: RatingMap = {
  // Verbal → 9.2%
  verbal_1: "all", verbal_2: "most", verbal_3: "all", verbal_4: "all",
  // Non-Verbal → 9.2%
  nonverbal_1: "all", nonverbal_2: "all", nonverbal_3: "all", nonverbal_4: "most",
  // Communication → 8.3%
  comm_1: "all", comm_2: "most", comm_3: "most", comm_4: "all",
  // Lesson Planning → 7.5% (plan_1 left unrated = 0)
  plan_2: "all", plan_3: "all", plan_4: "all",
  // Instructional → 6.7%
  instr_1: "all", instr_2: "most", instr_3: "most", instr_4: "part",
  // Part 2 — entirely unrated → 0%
};

describe("gradeFor (Optimum/Proficient/Developing/Underperforming/Poor)", () => {
  it("maps the band boundaries", () => {
    expect(gradeFor(100)).toBe("optimum");
    expect(gradeFor(85)).toBe("optimum");
    expect(gradeFor(84.9)).toBe("proficient");
    expect(gradeFor(70)).toBe("proficient");
    expect(gradeFor(69.9)).toBe("developing");
    expect(gradeFor(55)).toBe("developing");
    expect(gradeFor(54.9)).toBe("underperforming");
    expect(gradeFor(40)).toBe("underperforming");
    expect(gradeFor(39.9)).toBe("poor");
    expect(gradeFor(0)).toBe("poor");
  });
});

describe("computeAssessment (faithful to the sheet)", () => {
  const result = computeAssessment(EXAMPLE);
  const part1 = result.parts.find((p) => p.key === "part1")!;
  const part2 = result.parts.find((p) => p.key === "part2")!;
  const sub = (k: string) => part1.subScores.find((s) => s.key === k)!.score;

  it("reproduces each Part-1 sub-category percentage", () => {
    expect(sub("verbal")).toBeCloseTo(9.17, 1);
    expect(sub("non_verbal")).toBeCloseTo(9.17, 1);
    expect(sub("communication")).toBeCloseTo(8.33, 1);
    expect(sub("lesson_planning")).toBeCloseTo(7.5, 2);
    expect(sub("instructional")).toBeCloseTo(6.67, 1);
  });

  it("grades Part 1 Proficient and Part 2 Poor (unrated → 0)", () => {
    expect(part1.percent).toBeCloseTo(81.67, 1); // 40.83 / 50
    expect(part1.grade).toBe("proficient");
    expect(part2.score).toBe(0);
    expect(part2.grade).toBe("poor");
  });

  it("totals to ~40.8% → Underperforming Final grade", () => {
    expect(result.totalPercent).toBeCloseTo(40.83, 1);
    expect(result.finalGrade).toBe("underperforming");
  });

  it("a perfect form scores 100 → Optimum", () => {
    const allKeys = computeAssessment({}); // unrated baseline = 0
    expect(allKeys.totalPercent).toBe(0);
    expect(allKeys.finalGrade).toBe("poor");
  });
});
