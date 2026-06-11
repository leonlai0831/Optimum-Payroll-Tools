import { beforeAll, describe, expect, it } from "vitest";

// In-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

import { calcFreelancer } from "./calc";
import type { FreelancerInput } from "./types";

function mkInput(overrides: Partial<FreelancerInput> = {}): FreelancerInput {
  return {
    coachId: null,
    name: "FREE FIONA",
    position: "T1",
    icNo: "900101-14-5678",
    bankName: "MAYBANK",
    bankAccount: "1122334455",
    centerRows: [{ center: "HQ", replacedHours: 10, fixedHours: 25, absent: false }],
    blackCount: 2,
    colourCount: 20,
    extras: [],
    ...overrides,
  };
}

describe("Freelancer DB layer (PGlite in-memory)", () => {
  let queries: typeof import("../db/queries");

  beforeAll(async () => {
    queries = await import("../db/queries");
  });

  it("seeds the default freelancer config and round-trips edits", async () => {
    const cfg = await queries.getFreelancerConfig();
    expect(cfg.rates.T1).toEqual({ groupA: 16, groupB: 18 });
    expect(cfg.rates.I1).toEqual({ groupA: 26, groupB: 30 });
    expect(cfg.groupACenters).toEqual(["HQ", "BK", "BT"]);
    expect(cfg.attendanceBonus).toBe(0.2);
    expect(cfg.commitment.values[3]).toEqual([0.15, 0.2, 0.25]);
    expect(cfg.entities.map((e) => e.key)).toEqual(["OT", "OTG", "PJ", "QSM", "KM"]);

    const edited = structuredClone(cfg);
    edited.rates.T1.groupB = 19;
    edited.attendanceBonus = 0.25;
    await queries.saveFreelancerConfig(edited);
    const after = await queries.getFreelancerConfig();
    expect(after.rates.T1.groupB).toBe(19);
    expect(after.attendanceBonus).toBe(0.25);

    // Restore defaults so later tests compute against known numbers.
    const { DEFAULT_FREELANCER_CONFIG } = await import("./defaults");
    await queries.saveFreelancerConfig(structuredClone(DEFAULT_FREELANCER_CONFIG));
  });

  it("saves a run, creates the coach (freelancer, position + payee), lists by period", async () => {
    const cfg = await queries.getFreelancerConfig();
    const input = mkInput();
    const id = await queries.upsertFreelancerRun({
      periodLabel: "2026-05",
      input,
      result: calcFreelancer(input, cfg),
      configSnapshot: cfg,
    });
    expect(id).toBeGreaterThan(0);

    const list = await queries.listFreelancerRuns("2026-05");
    expect(list.length).toBe(1);
    expect(list[0].canonicalName).toBe("FREE FIONA");
    expect(list[0].position).toBe("T1");
    // 35h → commitment 0.15 (row 31+, result 0.9): 16 × (10×1.15 + 25×1.35).
    expect(list[0].grandTotal).toBe(724);
    expect(list[0].coachId).not.toBeNull();

    // Payee carry-over: the coach profile remembers position + bank details.
    const coaches = await queries.listCoaches();
    const fiona = coaches.find((c) => c.canonicalName === "FREE FIONA");
    expect(fiona?.employmentType).toBe("freelancer");
    expect(fiona?.allowanceTier).toBe("T1");
    expect(fiona?.icNo).toBe("900101-14-5678");
    expect(fiona?.bankName).toBe("MAYBANK");
    expect(fiona?.bankAccount).toBe("1122334455");
  });

  it("upserts the same (period, coach) without duplicating; blank payee fields never wipe stored ones", async () => {
    const cfg = await queries.getFreelancerConfig();
    const updated = mkInput({
      icNo: "",
      bankName: "",
      bankAccount: "",
      centerRows: [{ center: "PK", replacedHours: 0, fixedHours: 10, absent: false }],
    });
    await queries.upsertFreelancerRun({
      periodLabel: "2026-05",
      input: updated,
      result: calcFreelancer(updated, cfg),
      configSnapshot: cfg,
    });

    const list = await queries.listFreelancerRuns("2026-05");
    expect(list.length).toBe(1); // replaced, not duplicated
    expect(list[0].grandTotal).toBe(216); // 18 × 10×1.2 (no commitment below 31h)

    const coaches = await queries.listCoaches();
    const fiona = coaches.find((c) => c.canonicalName === "FREE FIONA");
    expect(fiona?.icNo).toBe("900101-14-5678"); // blank input didn't clear it
    expect(fiona?.bankName).toBe("MAYBANK");
  });

  it("allows several records per month across position groups + late submissions; CC never touches the tier", async () => {
    const cfg = await queries.getFreelancerConfig();
    const save = (input: ReturnType<typeof mkInput>) =>
      queries.upsertFreelancerRun({
        periodLabel: "2026-06",
        input,
        result: calcFreelancer(input, cfg),
        configSnapshot: cfg,
      });

    // teaching + admin + CC in the SAME payout month → three rows.
    await save(mkInput({ position: "T1" }));
    await save(mkInput({ position: "A1" }));
    await save(mkInput({ position: "CC" }));
    // …and an APRIL late submission of the teaching family → a fourth.
    await save(mkInput({ position: "T1", workPeriod: "2026-04" }));
    expect((await queries.listFreelancerRuns("2026-06")).length).toBe(4);

    // Re-saving the same (group, work month) replaces, not duplicates.
    await save(mkInput({ position: "T2" })); // still teaching, same June work
    const list = await queries.listFreelancerRuns("2026-06");
    expect(list.length).toBe(4);
    expect(list.map((r) => r.position).sort()).toEqual(["A1", "CC", "T1", "T2"]);

    // CC must not overwrite the coach's allowance tier (last tier write wins:
    // T2 from the teaching re-save).
    const coaches = await queries.listCoaches();
    const fiona = coaches.find((c) => c.canonicalName === "FREE FIONA");
    expect(fiona?.allowanceTier).toBe("T2");
  });

  it("links to an existing coach by name and remembers the new position", async () => {
    await queries.createCoach({ canonicalName: "KNOWN KARL", allowanceTier: "T0" });
    const cfg = await queries.getFreelancerConfig();
    const input = mkInput({ name: "KNOWN KARL", position: "T2" });
    await queries.upsertFreelancerRun({
      periodLabel: "2026-06",
      input,
      result: calcFreelancer(input, cfg),
      configSnapshot: cfg,
    });
    const coaches = await queries.listCoaches();
    const karls = coaches.filter((c) => c.canonicalName === "KNOWN KARL");
    expect(karls.length).toBe(1); // linked, not duplicated
    expect(karls[0].allowanceTier).toBe("T2");
  });

  it("gets one run, lists periods, and deletes", async () => {
    const cfg = await queries.getFreelancerConfig();
    const input = mkInput({ name: "DEL DORA" });
    const id = await queries.upsertFreelancerRun({
      periodLabel: "2026-07",
      input,
      result: calcFreelancer(input, cfg),
      configSnapshot: cfg,
    });

    const run = await queries.getFreelancerRun(id);
    expect(run?.canonicalName).toBe("DEL DORA");
    expect(run?.configSnapshot.rates.T1.groupA).toBe(16);
    expect(run?.input.coachId).toBe(run?.coachId); // input gets the resolved id

    expect(await queries.listFreelancerPeriods()).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect((await queries.getFreelancerRunsForPeriod("2026-07")).length).toBe(1);

    await queries.deleteFreelancerRun(id);
    expect(await queries.getFreelancerRun(id)).toBeUndefined();
    expect(await queries.listFreelancerPeriods()).toEqual(["2026-05", "2026-06"]);
  });

  it("updateCoach accepts the payee fields", async () => {
    const created = await queries.createCoach({ canonicalName: "BANK BEN" });
    await queries.updateCoach(created.id, {
      icNo: "880202-10-1234",
      bankName: "CIMB BANK",
      bankAccount: "999888777",
    });
    const ben = await queries.getCoach(created.id);
    expect(ben?.icNo).toBe("880202-10-1234");
    expect(ben?.bankName).toBe("CIMB BANK");
    expect(ben?.bankAccount).toBe("999888777");
  });
});
