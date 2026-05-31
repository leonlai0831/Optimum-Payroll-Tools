import { describe, expect, it } from "vitest";
import { ALLOWANCE_TIERS } from "./types";
import { isLinkableTier, NON_TEACHING_TIERS, nonLinkableReason } from "./tier-rules";

describe("isLinkableTier", () => {
  it("blocks the non-teaching tiers A1/A2/A3/PA/T0", () => {
    for (const t of ["A1", "A2", "A3", "PA", "T0"] as const) {
      expect(isLinkableTier(t), t).toBe(false);
    }
  });

  it("allows the teaching tiers T1–T4 and I1–I3", () => {
    for (const t of ["T1", "T2", "T3", "T4", "I1", "I2", "I3"] as const) {
      expect(isLinkableTier(t), t).toBe(true);
    }
  });

  it("treats unknown/empty tier as linkable (don't block on missing data)", () => {
    expect(isLinkableTier(null)).toBe(true);
    expect(isLinkableTier(undefined)).toBe(true);
  });

  it("covers every defined tier (no tier left unclassified)", () => {
    for (const t of ALLOWANCE_TIERS) {
      expect(typeof isLinkableTier(t)).toBe("boolean");
    }
    // The two sets partition all tiers.
    const linkable = ALLOWANCE_TIERS.filter((t) => isLinkableTier(t));
    expect(linkable.length + NON_TEACHING_TIERS.length).toBe(ALLOWANCE_TIERS.length);
  });
});

describe("nonLinkableReason", () => {
  it("explains T0 as not-yet-assessed", () => {
    expect(nonLinkableReason("T0")).toMatch(/assessment/i);
  });
  it("explains admin tiers as attendance-only", () => {
    expect(nonLinkableReason("A1")).toMatch(/admin|attendance/i);
  });
});
