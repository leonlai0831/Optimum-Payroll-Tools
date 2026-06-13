import { describe, expect, it } from "vitest";
import { launcherBadgeCount } from "./badges";

describe("launcherBadgeCount — roll a section's attention counts onto its card", () => {
  const badges = {
    "/timesheets/review": 3,
    "/lesson-plans/history": 2,
    "/system/errors": 5,
  };

  it("maps each launcher card to its section's destination count", () => {
    expect(launcherBadgeCount("/timesheets", badges)).toBe(3);
    expect(launcherBadgeCount("/lesson-plans/history", badges)).toBe(2);
    expect(launcherBadgeCount("/system/users", badges)).toBe(5);
  });

  it("is 0 for a card with no badge source, an unknown href, or no href", () => {
    expect(launcherBadgeCount("/allowance/history", badges)).toBe(0);
    expect(launcherBadgeCount("/nope", badges)).toBe(0);
    expect(launcherBadgeCount(undefined, badges)).toBe(0);
  });

  it("is 0 when the destination count is absent or zero", () => {
    expect(launcherBadgeCount("/timesheets", {})).toBe(0);
    expect(launcherBadgeCount("/system/users", { "/system/errors": 0 })).toBe(0);
  });
});
