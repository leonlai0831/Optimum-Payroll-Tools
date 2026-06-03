import { describe, expect, it } from "vitest";
import { retentionWatch, type RetentionInput } from "./retention";

const pts = (scores: number[]): RetentionInput["points"] =>
  scores.map((score, i) => ({ period: `2026-0${i + 1}`, score }));

describe("retentionWatch", () => {
  it("ignores coaches with fewer than 3 readings", () => {
    expect(retentionWatch([{ name: "A", points: pts([1.2, 0.8]) }])).toEqual([]);
  });

  it("ignores stable / improving coaches", () => {
    const out = retentionWatch([
      { name: "Steady", points: pts([1.0, 1.02, 1.01]) },
      { name: "Rising", points: pts([0.9, 1.0, 1.1]) },
    ]);
    expect(out).toEqual([]);
  });

  it("flags a sustained decline and includes the numbers", () => {
    const out = retentionWatch([{ name: "Dipping", points: pts([1.2, 1.0, 0.85]) }]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Dipping");
    expect(out[0].direction).toBe("declining");
    expect(out[0].reasons.join(" ")).toContain("1.20");
    expect(out[0].reasons.join(" ")).toContain("0.85");
  });

  it("marks a large drop from peak as elevated", () => {
    const out = retentionWatch([{ name: "BigDrop", points: pts([1.3, 1.1, 0.9]) }]);
    expect(out[0].level).toBe("elevated"); // drop of 0.40 >= 0.25
    expect(out[0].changeFromPeak).toBeCloseTo(-0.4);
  });

  it("sorts the most concerning (biggest drop) first", () => {
    const out = retentionWatch([
      { name: "Small", points: pts([1.0, 0.95, 0.84]) }, // -0.16
      { name: "Large", points: pts([1.4, 1.1, 0.9]) }, // -0.50
    ]);
    expect(out[0].name).toBe("Large");
  });
});
