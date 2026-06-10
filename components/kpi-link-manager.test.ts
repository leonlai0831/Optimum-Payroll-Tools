import { describe, expect, it } from "vitest";
import { needsRecheck, type LinkCoach } from "./kpi-link-manager";

const coach = (over: Partial<LinkCoach>): LinkCoach => ({
  id: 1,
  canonicalName: "X",
  aliases: [],
  center: "",
  tier: null,
  kpiLinkNa: false,
  kpiLinkNaTier: null,
  ...over,
});

describe("needsRecheck — re-surface NA when a coach moves up to a teaching tier", () => {
  it("flags a coach NA'd at T0 who is now T1", () => {
    expect(needsRecheck(coach({ kpiLinkNa: true, kpiLinkNaTier: "T0", tier: "T1" }))).toBe(true);
  });

  it("does NOT flag a coach NA'd while already on a teaching tier (manual NA stays)", () => {
    // Marked N/A at T2 on purpose — moving within teaching tiers shouldn't nag.
    expect(needsRecheck(coach({ kpiLinkNa: true, kpiLinkNaTier: "T2", tier: "T2" }))).toBe(false);
    expect(needsRecheck(coach({ kpiLinkNa: true, kpiLinkNaTier: "T2", tier: "T3" }))).toBe(false);
  });

  it("does NOT flag a coach still on a locked tier", () => {
    expect(needsRecheck(coach({ kpiLinkNa: true, kpiLinkNaTier: "T0", tier: "T0" }))).toBe(false);
    expect(needsRecheck(coach({ kpiLinkNa: true, kpiLinkNaTier: "A1", tier: "PA" }))).toBe(false);
  });

  it("does NOT flag a coach who isn't NA", () => {
    expect(needsRecheck(coach({ kpiLinkNa: false, tier: "T1" }))).toBe(false);
  });

  it("flags when NA tier was unknown (null) but coach is now teaching", () => {
    expect(needsRecheck(coach({ kpiLinkNa: true, kpiLinkNaTier: null, tier: "T2" }))).toBe(true);
  });
});
