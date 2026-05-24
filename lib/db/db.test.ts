import { beforeAll, describe, expect, it } from "vitest";

// Use an in-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

describe("DB layer (PGlite in-memory)", () => {
  let queries: typeof import("./queries");

  beforeAll(async () => {
    queries = await import("./queries");
  });

  it("seeds default config and round-trips a saved config", async () => {
    const cfg = await queries.getConfig();
    expect(cfg.personalKpi.length).toBe(6);
    expect(cfg.centerTargets.Berkeley).toBe(450);

    const edited = structuredClone(cfg);
    edited.gradeThresholds.S = 1.3;
    await queries.saveConfig(edited);
    expect((await queries.getConfig()).gradeThresholds.S).toBe(1.3);
  });

  it("creates a run, lists it, and upserts a coach profile", async () => {
    const id = await queries.createRun({
      periodLabel: "2026-04",
      filename: "test.csv",
      csvRows: [],
      configSnapshot: queries.defaultConfig(),
      coachResults: [
        {
          coachId: null,
          canonicalName: "HONG LI",
          accounts: ["HONG LI [BK]", "HONG LI HARVEST"],
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
          payout: 1224,
          breakdown: [],
          isComplete: true,
        },
      ],
    });
    expect(id).toBeGreaterThan(0);

    const runsList = await queries.listRuns();
    expect(runsList.length).toBeGreaterThan(0);
    expect(runsList[0].totalPayout).toBe(1224);

    const known = await queries.getKnownCoaches();
    const hongli = known.find((c) => c.canonicalName === "HONG LI");
    expect(hongli?.aliases).toContain("HONG LI HARVEST");
  });
});
