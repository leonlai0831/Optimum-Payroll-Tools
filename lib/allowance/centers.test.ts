import { describe, expect, it } from "vitest";
import { makeCenterNormalizer, normalizeCenter } from "./centers";

const centers = ["HQ", "BK", "USJ", "QSM", "PJ", "KM"];
const aliases: Record<string, string[]> = {
  USJ: ["Subang USJ"],
  BK: ["Berkeley"],
  KM: ["Kemuning"],
  PJ: ["Petaling Jaya"],
};

describe("normalizeCenter", () => {
  it("returns the canonical code for an exact code match (case-insensitive)", () => {
    expect(normalizeCenter("HQ", centers, aliases)).toBe("HQ");
    expect(normalizeCenter("hq", centers, aliases)).toBe("HQ");
    expect(normalizeCenter("  qsm  ", centers, aliases)).toBe("QSM");
  });

  it("maps an alias to its code (case-insensitive)", () => {
    expect(normalizeCenter("Subang USJ", centers, aliases)).toBe("USJ");
    expect(normalizeCenter("berkeley", centers, aliases)).toBe("BK");
    expect(normalizeCenter("  KEMUNING ", centers, aliases)).toBe("KM");
  });

  it("prefers a code match over an alias match", () => {
    // "PJ" is both a code and (hypothetically) could be aliased elsewhere — code wins.
    const tricky = { ...aliases, KM: ["PJ"] };
    expect(normalizeCenter("PJ", centers, tricky)).toBe("PJ");
  });

  it("keeps the trimmed raw value when nothing matches", () => {
    expect(normalizeCenter("Some New Center", centers, aliases)).toBe("Some New Center");
    expect(normalizeCenter("  Cheras  ", centers, aliases)).toBe("Cheras");
  });

  it("returns blank for blank/whitespace input", () => {
    expect(normalizeCenter("", centers, aliases)).toBe("");
    expect(normalizeCenter("   ", centers, aliases)).toBe("");
  });

  it("tolerates an empty/missing alias map", () => {
    expect(normalizeCenter("HQ", centers, {})).toBe("HQ");
    expect(normalizeCenter("Berkeley", centers, {})).toBe("Berkeley");
  });
});

describe("makeCenterNormalizer", () => {
  it("matches the behavior of normalizeCenter", () => {
    const fn = makeCenterNormalizer(centers, aliases);
    expect(fn("hq")).toBe("HQ");
    expect(fn("Subang USJ")).toBe("USJ");
    expect(fn("  Cheras  ")).toBe("Cheras");
    expect(fn("")).toBe("");
  });
});
