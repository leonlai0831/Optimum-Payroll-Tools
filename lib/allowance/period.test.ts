import { describe, expect, it } from "vitest";
import { currentPeriod, isValidPeriod, nextPeriod, previousPeriod } from "./period";

describe("allowance period helpers", () => {
  it("validates YYYY-MM labels", () => {
    expect(isValidPeriod("2026-06")).toBe(true);
    expect(isValidPeriod("2026-01")).toBe(true);
    expect(isValidPeriod("2026-12")).toBe(true);
    expect(isValidPeriod("2026-13")).toBe(false); // no month 13
    expect(isValidPeriod("2026-00")).toBe(false);
    expect(isValidPeriod("2026-6")).toBe(false); // needs zero-pad
    expect(isValidPeriod("26-06")).toBe(false);
    expect(isValidPeriod("2026/06")).toBe(false);
    expect(isValidPeriod("")).toBe(false);
  });

  it("steps to the previous month, crossing the year boundary", () => {
    expect(previousPeriod("2026-06")).toBe("2026-05");
    expect(previousPeriod("2026-10")).toBe("2026-09");
    expect(previousPeriod("2026-01")).toBe("2025-12");
  });

  it("steps to the next month, crossing the year boundary", () => {
    expect(nextPeriod("2026-06")).toBe("2026-07");
    expect(nextPeriod("2026-09")).toBe("2026-10");
    expect(nextPeriod("2026-12")).toBe("2027-01");
  });

  it("throws on malformed input rather than guessing", () => {
    expect(() => previousPeriod("2026-13")).toThrow();
    expect(() => nextPeriod("nope")).toThrow();
  });

  it("formats a date as a period label", () => {
    expect(currentPeriod(new Date(2026, 0, 15))).toBe("2026-01"); // month is 0-indexed
    expect(currentPeriod(new Date(2026, 11, 1))).toBe("2026-12");
  });
});
