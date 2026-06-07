import { describe, expect, it } from "vitest";
import { auditRun, type AuditCoach, type AuditAllowanceRec } from "./audit";

const coach = (over: Partial<AuditCoach> = {}): AuditCoach => ({
  coachId: null,
  canonicalName: "ALICE",
  accounts: [],
  teachingAllowance: 1000,
  finalScore: 1.0,
  payout: 1000,
  isComplete: true,
  ...over,
});

describe("auditRun", () => {
  it("reports nothing when payout, completeness, and allowance all reconcile", () => {
    const coaches = [coach()];
    const allowances: AuditAllowanceRec[] = [{ coachId: null, canonicalName: "ALICE", teaching: 1000 }];
    expect(auditRun(coaches, allowances)).toEqual([]);
  });

  it("flags a payout that doesn't equal score × allowance", () => {
    const coaches = [coach({ payout: 1200 })]; // should be 1.0 × 1000 = 1000
    const out = auditRun(coaches, [{ coachId: null, canonicalName: "ALICE", teaching: 1000 }]);
    expect(out.some((f) => f.kind === "payout_formula" && f.severity === "high")).toBe(true);
  });

  it("flags a non-zero payout on an incomplete coach", () => {
    const coaches = [coach({ isComplete: false })];
    const out = auditRun(coaches, [{ coachId: null, canonicalName: "ALICE", teaching: 1000 }]);
    expect(out.some((f) => f.kind === "paid_incomplete")).toBe(true);
  });

  it("flags a mismatch between KPI allowance and the allowance calculator", () => {
    const coaches = [coach()]; // used 1000
    const out = auditRun(coaches, [{ coachId: null, canonicalName: "ALICE", teaching: 1134 }]);
    expect(out.some((f) => f.kind === "allowance_mismatch" && f.severity === "high")).toBe(true);
  });

  it("flags a paid coach with no matching allowance record", () => {
    const out = auditRun([coach()], []);
    expect(out.some((f) => f.kind === "no_allowance_record")).toBe(true);
  });

  it("matches allowance by name case-insensitively and tolerates cent rounding", () => {
    const coaches = [coach({ teachingAllowance: 1000, payout: 1000 })];
    const out = auditRun(coaches, [{ coachId: null, canonicalName: "  alice ", teaching: 1000.004 }]);
    expect(out).toEqual([]);
  });

  it("matches a short KPI name to its full-name allowance record (no false 'no record')", () => {
    // The leaderboard links EEMIN's allowance via the shared coach profile id;
    // the audit must use the same ladder, not a brittle exact-name lookup, or it
    // wrongly reports "no matching allowance record" for short-vs-full names.
    const coaches = [
      coach({ canonicalName: "EEMIN", coachId: 42, teachingAllowance: 661, payout: 661 }),
    ];
    const allowances: AuditAllowanceRec[] = [
      { coachId: 42, canonicalName: "MUHAMMAD AMIN BIN ALI", teaching: 661 },
    ];
    expect(auditRun(coaches, allowances)).toEqual([]);
  });

  it("still matches a short name to a full name via account alias", () => {
    const coaches = [
      coach({ canonicalName: "VASSEN", accounts: ["VASSEN [BK]"], teachingAllowance: 800, payout: 800 }),
    ];
    const allowances: AuditAllowanceRec[] = [
      { coachId: null, canonicalName: "VASSENTHAN", teaching: 800, aliases: ["VASSEN [BK]"] },
    ];
    expect(auditRun(coaches, allowances).some((f) => f.kind === "no_allowance_record")).toBe(false);
  });
});
