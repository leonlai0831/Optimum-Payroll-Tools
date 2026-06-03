import { describe, expect, it } from "vitest";
import { auditRun, type AuditCoach, type AuditAllowanceRec } from "./audit";

const coach = (over: Partial<AuditCoach> = {}): AuditCoach => ({
  canonicalName: "ALICE",
  teachingAllowance: 1000,
  finalScore: 1.0,
  payout: 1000,
  isComplete: true,
  ...over,
});

describe("auditRun", () => {
  it("reports nothing when payout, completeness, and allowance all reconcile", () => {
    const coaches = [coach()];
    const allowances: AuditAllowanceRec[] = [{ canonicalName: "ALICE", teaching: 1000 }];
    expect(auditRun(coaches, allowances)).toEqual([]);
  });

  it("flags a payout that doesn't equal score × allowance", () => {
    const coaches = [coach({ payout: 1200 })]; // should be 1.0 × 1000 = 1000
    const out = auditRun(coaches, [{ canonicalName: "ALICE", teaching: 1000 }]);
    expect(out.some((f) => f.kind === "payout_formula" && f.severity === "high")).toBe(true);
  });

  it("flags a non-zero payout on an incomplete coach", () => {
    const coaches = [coach({ isComplete: false })];
    const out = auditRun(coaches, [{ canonicalName: "ALICE", teaching: 1000 }]);
    expect(out.some((f) => f.kind === "paid_incomplete")).toBe(true);
  });

  it("flags a mismatch between KPI allowance and the allowance calculator", () => {
    const coaches = [coach()]; // used 1000
    const out = auditRun(coaches, [{ canonicalName: "ALICE", teaching: 1134 }]);
    expect(out.some((f) => f.kind === "allowance_mismatch" && f.severity === "high")).toBe(true);
  });

  it("flags a paid coach with no matching allowance record", () => {
    const out = auditRun([coach()], []);
    expect(out.some((f) => f.kind === "no_allowance_record")).toBe(true);
  });

  it("matches allowance by name case-insensitively and tolerates cent rounding", () => {
    const coaches = [coach({ teachingAllowance: 1000, payout: 1000 })];
    const out = auditRun(coaches, [{ canonicalName: "  alice ", teaching: 1000.004 }]);
    expect(out).toEqual([]);
  });
});
