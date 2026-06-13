import { beforeAll, describe, expect, it } from "vitest";
import type { InstructorRow } from "../kpi/types";

// Use an in-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

function row(over: Partial<InstructorRow> = {}): InstructorRow {
  return {
    Center: "Berkeley",
    Instructor: "CK [BK]",
    TotalStudent: 150,
    TotalColor: 40,
    Black: 4,
    LevelUp: 12,
    Downgrade: 0,
    Switch: 0,
    Stop: 1,
    Attended: 600,
    ...over,
  };
}

describe("getKpiResultCandidates (PGlite in-memory)", () => {
  let queries: typeof import("./queries");

  beforeAll(async () => {
    queries = await import("./queries");
  });

  it("keeps branch accounts separate (no getCleanName merging) but sums rows of the SAME account", async () => {
    await queries.createKpiIngest({
      periodLabel: "2026-03",
      label: "march",
      rows: [
        // Two rows of the SAME raw account (multi-center) — these sum.
        row({ Instructor: "CK [BK]", Black: 15, TotalColor: 60 }),
        row({ Instructor: "CK [BK]", Center: "HQ", Black: 2, TotalColor: 10 }),
        // A DIFFERENT branch account of the same person — stays its own
        // candidate (operator decision 2026-06-12: a freelancer's result
        // binds the branch account they actually teach at, never an
        // auto-merged person total).
        row({ Instructor: "CK [PK]", Black: 6, TotalColor: 41 }),
        row({ Instructor: "JACK LAM", Black: 6, TotalColor: 19 }),
      ],
    });

    const candidates = await queries.getKpiResultCandidates("2026-03");
    expect(candidates).toEqual([
      { name: "CK [BK]", black: 17, colour: 70 },
      { name: "CK [PK]", black: 6, colour: 41 },
      { name: "JACK LAM", black: 6, colour: 19 },
    ]);
  });
});
