import { describe, it, expect } from "vitest";
import { calcMetricScore, aggregateRows, calculateScores, getGrade, getCenterTarget } from "./calc";
import { mapCsvRows, getCleanName } from "./csv";
import { buildGroups, uniqueInstructorNames } from "./merge";
import {
  DEFAULT_PERSONAL_KPI,
  DEFAULT_CENTER_TARGETS,
  DEFAULT_GRADE_THRESHOLDS,
} from "./metrics";
import type { InstructorRow } from "./types";

describe("calcMetricScore (ported v11.1 curves)", () => {
  it("standard: flat 0.5 below min, 1.5 at/above max", () => {
    expect(calcMetricScore(0.1, 0.2, 0.4, "standard")).toBe(0.5);
    expect(calcMetricScore(0.5, 0.2, 0.4, "standard")).toBe(1.5);
    expect(calcMetricScore(0.4, 0.2, 0.4, "standard")).toBe(1.5);
  });
  it("standard: 1.0 at min, power curve to 1.5", () => {
    expect(calcMetricScore(0.2, 0.2, 0.4, "standard")).toBeCloseTo(1.0, 6);
    // mgmt 85 in [70,90]: t=0.75 -> 1 + 0.75^1.5*0.5
    expect(calcMetricScore(85, 70, 90, "standard")).toBeCloseTo(1.32476, 4);
  });
  it("growth: linear below min, log above", () => {
    expect(calcMetricScore(123, 140, 280, "growth")).toBeCloseTo(123 / 140, 6);
    expect(calcMetricScore(280, 140, 280, "growth")).toBeCloseTo(1.49907, 4);
  });
  it("lower: best at/below min, worst at/above max", () => {
    expect(calcMetricScore(0, 0, 0.1, "lower")).toBe(1.5);
    expect(calcMetricScore(0.1, 0, 0.1, "lower")).toBe(0.5);
    expect(calcMetricScore(0.05, 0, 0.1, "lower")).toBeCloseTo(1.32322, 4);
  });
});

const COBYS_RAW = {
  tr_name: " COBYS [BK]",
  cr_name: "Berkeley",
  GREEN: 10, ORANGE: 21, RED: 13, BROWN: 9, BLACK: 9, "TTL-COLOR": 62,
  "Total Student": 123, UP: 4, DOWN: 0, SWITCH: 3,
  STUDENT_STOP: 4, STUDENT_ATTENDED_CLASS: 503,
};

describe("CSV mapping (ported v11.1 mapCsvHeaders)", () => {
  it("maps real tutor-KPI headers to canonical fields", () => {
    const [row] = mapCsvRows([COBYS_RAW]);
    expect(row.Center).toBe("Berkeley");
    expect(row.Instructor).toBe(" COBYS [BK]");
    expect(row.TotalStudent).toBe(123);
    expect(row.TotalColor).toBe(62);
    expect(row.Black).toBe(9);
    expect(row.LevelUp).toBe(4);
    expect(row.Downgrade).toBe(0);
    expect(row.Stop).toBe(4);
    expect(row.Attended).toBe(503);
  });

  it("accepts TTL-LVL as a Total Student header (distinct from TTL-COLOR)", () => {
    const [row] = mapCsvRows([{ tr_name: "X", "TTL-LVL": 88, "TTL-COLOR": 10 }]);
    expect(row.TotalStudent).toBe(88);
    expect(row.TotalColor).toBe(10);
  });
});

describe("calculateScores (full integration, default personal KPI)", () => {
  it("reproduces v11.1 score for COBYS [BK] at mgmt 85", () => {
    const rows = mapCsvRows([COBYS_RAW]);
    const agg = aggregateRows(rows);
    const { totalScore, breakdown } = calculateScores(agg, DEFAULT_PERSONAL_KPI, 85);
    // hand-computed from v11.1 formulas
    expect(totalScore).toBeCloseTo(0.9354, 3);
    const byId = Object.fromEntries(breakdown.map((b) => [b.id, b]));
    expect(byId.upgrade_rate.score).toBe(0.5); // 6.45% < 20% min
    expect(byId.retention_rate.score).toBe(0.5); // 96.75% < 97% min
    expect(byId.upgrade_rate.displayValue).toBe("6.45%");
    expect(getGrade(totalScore, DEFAULT_GRADE_THRESHOLDS).grade).toBe("B");
  });
});

describe("getCenterTarget", () => {
  it("resolves exact, substring, then default 140", () => {
    expect(getCenterTarget("Berkeley", DEFAULT_CENTER_TARGETS)).toBe(450);
    expect(getCenterTarget("Puchong Kinrara", DEFAULT_CENTER_TARGETS)).toBe(750);
    expect(getCenterTarget("Nowhere", DEFAULT_CENTER_TARGETS)).toBe(140);
  });
});

describe("merge grouping", () => {
  it("deterministically merges same clean name across centers (v11.1 behavior)", () => {
    const groups = buildGroups({ names: ["JIE SHERN [BK]", "JIE SHERN [BT]", "VASSEN [BK]"] });
    const js = groups.find((g) => g.canonicalName === "JIE SHERN");
    expect(js?.accounts.sort()).toEqual(["JIE SHERN [BK]", "JIE SHERN [BT]"]);
    expect(groups.length).toBe(2);
  });
  it("folds numbered overflow into the base coach (classifier)", () => {
    // COBYS 2 is an overflow class for COBYS. The classifier now attributes it
    // to COBYS (excluded from the score by default downstream); v11.1 left it
    // as a phantom separate account that only AI could merge.
    const groups = buildGroups({ names: ["COBYS [BK]", "COBYS 2 [BK]"] });
    expect(groups.length).toBe(1);
    expect(groups[0].canonicalName).toBe("COBYS");
  });
  it("folds a HARVEST placeholder into its coach (classifier)", () => {
    const groups = buildGroups({ names: ["HONG LI [BK]", "HONG LI HARVEST"] });
    expect(groups.length).toBe(1);
    expect(groups[0].canonicalName).toBe("HONG LI");
  });
  it("merges cross-format aliases when AI clusters them", () => {
    const groups = buildGroups({
      names: ["HONG LI [BK]", "HONG LI HARVEST"],
      aiClusters: [["HONG LI [BK]", "HONG LI HARVEST"]],
    });
    expect(groups.length).toBe(1);
    expect(groups[0].accounts.length).toBe(2);
  });
  it("uses known coach profile canonical name", () => {
    const groups = buildGroups({
      names: ["HONG LI [BK]", "HONG LI HARVEST"],
      knownCoaches: [{ canonicalName: "Hong Li", aliases: ["HONG LI [BK]", "HONG LI HARVEST"] }],
    });
    expect(groups.length).toBe(1);
    expect(groups[0].canonicalName).toBe("Hong Li");
  });
});

describe("getCleanName / uniqueInstructorNames", () => {
  it("strips bracket + dash suffixes and upper-cases", () => {
    expect(getCleanName(" COBYS 2 [BK]")).toBe("COBYS 2");
    expect(getCleanName("AH ANN - JUN MIN [BT]")).toBe("AH ANN");
  });
  it("dedupes and drops Unknown", () => {
    const rows = [
      { Instructor: "A" }, { Instructor: "A" }, { Instructor: "Unknown" },
    ] as InstructorRow[];
    expect(uniqueInstructorNames(rows)).toEqual(["A"]);
  });
});
