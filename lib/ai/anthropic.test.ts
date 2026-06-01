import { beforeAll, describe, expect, it } from "vitest";
import {
  analyzeTrend,
  detectCsvAnomalies,
  summarizeRun,
  type DigestCoach,
} from "./anthropic";

// These tests run with no ANTHROPIC_API_KEY, so every function takes its
// deterministic fallback path — which is exactly the behaviour we want locked:
// the features must degrade gracefully when the key is absent.
beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("detectCsvAnomalies (no key)", () => {
  it("returns an empty list without an API key", async () => {
    const out = await detectCsvAnomalies([{ instructor: "ZOE [BK]", center: "BK", students: 80 }]);
    expect(out).toEqual([]);
  });

  it("returns an empty list for empty input", async () => {
    expect(await detectCsvAnomalies([])).toEqual([]);
  });
});

describe("summarizeRun (no key) — template fallback", () => {
  const coaches: DigestCoach[] = [
    { name: "ALICE", finalScore: 1.3, grade: "S", payout: 1300 },
    { name: "BOB", finalScore: 0.8, grade: "C", payout: 800 },
  ];

  it("names the period, total, top and bottom performer", async () => {
    const text = await summarizeRun({ period: "2026-05", coaches });
    expect(text).toContain("2026-05");
    expect(text).toContain("2"); // 2 coaches
    expect(text).toContain("ALICE"); // top
    expect(text).toContain("BOB"); // bottom
    expect(text).toContain("2100.00"); // total payout
  });

  it("handles an empty run", async () => {
    expect(await summarizeRun({ period: "2026-05", coaches: [] })).toContain("no coaches");
  });
});

describe("analyzeTrend (no key) — template fallback", () => {
  it("calls out an improving trajectory across months", async () => {
    const text = await analyzeTrend({
      name: "ALICE",
      points: [
        { period: "2026-03", score: 0.9, payout: 900 },
        { period: "2026-04", score: 1.0, payout: 1000 },
        { period: "2026-05", score: 1.2, payout: 1200 },
      ],
    });
    expect(text).toContain("ALICE");
    expect(text).toContain("improving");
    expect(text).toContain("2026-03");
    expect(text).toContain("2026-05");
  });

  it("handles a single month", async () => {
    const text = await analyzeTrend({
      name: "ALICE",
      points: [{ period: "2026-05", score: 1.0, payout: 1000 }],
    });
    expect(text).toContain("only");
  });

  it("handles no history", async () => {
    expect(await analyzeTrend({ name: "ALICE", points: [] })).toContain("no history");
  });
});
