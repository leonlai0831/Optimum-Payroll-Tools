import { describe, expect, it } from "vitest";
import { validateRunPayload } from "./run-validate";
import type { RunCoach } from "@/lib/types";

function coach(overrides: Partial<RunCoach> = {}): RunCoach {
  return {
    coachId: null,
    canonicalName: "COBY",
    accounts: ["COBY [BK]"],
    center: "Berkeley",
    position: "Instructor",
    teachingAllowance: 1200,
    mgmtAssessment: 85,
    groupConfig: null,
    students: 205,
    personalScore: 1.02,
    groupScore: 0,
    finalScore: 1.02,
    grade: "A",
    payout: 1.02 * 1200,
    breakdown: [],
    isComplete: true,
    ...overrides,
  };
}

const cfg = { personalKpi: [], centerKpi: [], centerTargets: {}, gradeThresholds: {} };

describe("validateRunPayload", () => {
  it("accepts a consistent payload", () => {
    expect(validateRunPayload({ configSnapshot: cfg, coachResults: [coach()] })).toBeNull();
  });

  it("rejects a missing or non-object configSnapshot", () => {
    expect(validateRunPayload({ coachResults: [] })).toMatch(/configSnapshot/);
    expect(validateRunPayload({ configSnapshot: null, coachResults: [] })).toMatch(/configSnapshot/);
    expect(validateRunPayload({ configSnapshot: "x", coachResults: [] })).toMatch(/configSnapshot/);
    expect(validateRunPayload({ configSnapshot: [1], coachResults: [] })).toMatch(/configSnapshot/);
  });

  it("rejects missing or non-array coachResults", () => {
    expect(validateRunPayload({ configSnapshot: cfg })).toMatch(/coachResults/);
    expect(validateRunPayload({ configSnapshot: cfg, coachResults: {} })).toMatch(/coachResults/);
  });

  it("rejects a payout that does not equal finalScore × teachingAllowance", () => {
    // Inflated by RM 100 — the exact attack/bug this validation exists for.
    const tampered = coach({ payout: 1.02 * 1200 + 100 });
    expect(
      validateRunPayload({ configSnapshot: cfg, coachResults: [tampered] }),
    ).toMatch(/COBY/);
    // Off by more than a sen is rejected too.
    const driftTooBig = coach({ payout: 1.02 * 1200 + 0.02 });
    expect(
      validateRunPayload({ configSnapshot: cfg, coachResults: [driftTooBig] }),
    ).not.toBeNull();
    // Missing payout with a numeric allowance is also inconsistent.
    expect(
      validateRunPayload({
        configSnapshot: cfg,
        coachResults: [coach({ payout: undefined as unknown as number })],
      }),
    ).not.toBeNull();
  });

  it("tolerates sub-sen float noise", () => {
    const noisy = coach({ payout: 1.02 * 1200 + 0.005 });
    expect(validateRunPayload({ configSnapshot: cfg, coachResults: [noisy] })).toBeNull();
  });

  it("skips the payout check when teachingAllowance is not set (draft coaches)", () => {
    // computeCoach treats a missing allowance as 0 (payout 0) — but the server
    // only enforces the invariant when an allowance is actually present.
    const draft = coach({ teachingAllowance: null, payout: 0, isComplete: false });
    expect(validateRunPayload({ configSnapshot: cfg, coachResults: [draft] })).toBeNull();
  });
});
