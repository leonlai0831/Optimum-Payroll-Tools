import { describe, expect, it } from "vitest";
import { classifySaveCollision, type ExistingRunKey } from "./collision";
import type { FreelancerPosition } from "./types";

let seq = 1;
function mkRun(overrides: Partial<ExistingRunKey> = {}): ExistingRunKey {
  return {
    id: seq++,
    canonicalName: "ANG YONG KIAN",
    position: "T1",
    workPeriod: "2026-05",
    grandTotal: 360,
    ...overrides,
  };
}

const target = (
  overrides: Partial<{
    name: string;
    position: FreelancerPosition;
    workPeriod: string;
    editingRunId: number | null;
  }> = {},
) => ({
  name: "ANG YONG KIAN",
  position: "T1" as FreelancerPosition,
  workPeriod: "2026-05",
  ...overrides,
});

describe("classifySaveCollision", () => {
  it("is none when the month has no records at all", () => {
    expect(classifySaveCollision(target(), [])).toEqual({ kind: "none" });
  });

  it("is none when only OTHER people have records in the month", () => {
    const runs = [mkRun({ canonicalName: "SOMEONE ELSE" })];
    expect(classifySaveCollision(target(), runs)).toEqual({ kind: "none" });
  });

  it("replaces on the same position FAMILY (T1 vs T2 are both teaching) + work month", () => {
    const existing = mkRun({ position: "T2" });
    expect(classifySaveCollision(target({ position: "T1" }), [existing])).toEqual({
      kind: "replace",
      existing,
    });
  });

  it("adds a second record when the position family differs (teaching vs admin vs cc)", () => {
    const teaching = mkRun({ position: "T1" });
    expect(classifySaveCollision(target({ position: "A1" }), [teaching])).toEqual({
      kind: "second",
      existing: [teaching],
    });
    expect(classifySaveCollision(target({ position: "CC" }), [teaching])).toEqual({
      kind: "second",
      existing: [teaching],
    });
  });

  it("adds a second record when the work month differs (late submission alongside the current month)", () => {
    const current = mkRun({ workPeriod: "2026-05" });
    expect(classifySaveCollision(target({ workPeriod: "2026-04" }), [current])).toEqual({
      kind: "second",
      existing: [current],
    });
  });

  it("lists every remaining same-person record in the second-record case", () => {
    const teaching = mkRun({ position: "T1" });
    const late = mkRun({ position: "T2", workPeriod: "2026-04" });
    expect(classifySaveCollision(target({ position: "A2" }), [teaching, late])).toEqual({
      kind: "second",
      existing: [teaching, late],
    });
  });

  it("is none when editing and the only same-key record is the one being edited", () => {
    const mine = mkRun();
    const result = classifySaveCollision(target({ editingRunId: mine.id }), [mine]);
    expect(result).toEqual({ kind: "none" });
  });

  it("replaces ANOTHER record when an edit's family/work month is changed onto its key", () => {
    const mine = mkRun({ position: "A1" });
    const other = mkRun({ position: "T1" });
    // Opened the admin record, switched the position to teaching → lands on the teaching slot.
    const result = classifySaveCollision(
      target({ position: "T1", editingRunId: mine.id }),
      [mine, other],
    );
    expect(result).toEqual({ kind: "replace", existing: other });
  });

  it("warns (second) when an edit's key changes and no record holds the new key — the opened record stays", () => {
    const mine = mkRun({ workPeriod: "2026-05" });
    const result = classifySaveCollision(
      target({ workPeriod: "2026-04", editingRunId: mine.id }),
      [mine],
    );
    expect(result).toEqual({ kind: "second", existing: [mine] });
  });
});
