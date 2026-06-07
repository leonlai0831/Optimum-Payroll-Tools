import { describe, expect, it } from "vitest";
import {
  linkAllowance,
  normalizeName,
  reconcileAllowances,
  type AllowanceLinkRec,
  type CoachLinkInfo,
} from "./allowance-link";

const rec = (canonicalName: string, extra: Partial<AllowanceLinkRec> = {}): AllowanceLinkRec => ({
  coachId: null,
  canonicalName,
  aliases: [],
  ...extra,
});
const coach = (canonicalName: string, extra: Partial<CoachLinkInfo> = {}): CoachLinkInfo => ({
  coachId: null,
  canonicalName,
  accounts: [],
  ...extra,
});

describe("normalizeName", () => {
  it("trims, collapses spaces, upper-cases", () => {
    expect(normalizeName("  teo   zhen ")).toBe("TEO ZHEN");
    expect(normalizeName("Vassenthan")).toBe("VASSENTHAN");
  });
});

describe("linkAllowance — ladder", () => {
  it("links by coachId first, even when names differ", () => {
    const list = [rec("WHOEVER", { coachId: 7 })];
    const r = linkAllowance(list, coach("DIFFERENT NAME", { coachId: 7 }));
    expect(r.method).toBe("coachId");
    expect(r.rec?.coachId).toBe(7);
  });

  it("links by exact name (old behavior preserved)", () => {
    const r = linkAllowance([rec("TEO ZHEN")], coach("TEO ZHEN"));
    expect(r.method).toBe("exact");
  });

  it("links case/spacing-insensitively — the main real-world failure", () => {
    // Allowance typed "Teo Zhen", KPI base name "TEO ZHEN".
    const r = linkAllowance([rec("Teo  Zhen")], coach("TEO ZHEN"));
    expect(r.method).toBe("normalized");
    expect(r.rec?.canonicalName).toBe("Teo  Zhen");
  });

  it("links a short KPI name to a full allowance name via account alias", () => {
    // KPI merged "VASSEN" (from VASSEN [BK]); allowance saved as "VASSENTHAN"
    // but remembered the account alias "VASSEN [BK]".
    const list = [rec("VASSENTHAN", { aliases: ["VASSEN [BK]", "VASSEN [HQ]"] })];
    const r = linkAllowance(list, coach("VASSEN", { accounts: ["VASSEN [BK]", "VASSEN [HQ]"] }));
    expect(r.method).toBe("alias");
    expect(r.rec?.canonicalName).toBe("VASSENTHAN");
  });

  it("returns none when nothing matches", () => {
    const r = linkAllowance([rec("ALICE")], coach("BOB"));
    expect(r.method).toBe("none");
    expect(r.rec).toBeNull();
  });

  it("prefers coachId over a competing normalized name", () => {
    const list = [rec("teo zhen", { coachId: 99 }), rec("OTHER", { coachId: 5 })];
    const r = linkAllowance(list, coach("TEO ZHEN", { coachId: 5 }));
    expect(r.method).toBe("coachId");
    expect(r.rec?.coachId).toBe(5);
  });
});

describe("reconcileAllowances — full picture", () => {
  it("links 4 of 5 coaches that the old exact match would have missed", () => {
    const list = [
      rec("Teo Zhen", { coachId: null }), // case differs
      rec("Vassenthan", { aliases: ["VASSEN [BK]"] }), // short vs full
      rec("CHLOE", { coachId: 3 }), // by id
      rec("Nobody This Month"), // orphan
    ];
    const coaches = [
      coach("TEO ZHEN"),
      coach("VASSEN", { accounts: ["VASSEN [BK]"] }),
      coach("CHLOE TAN", { coachId: 3 }),
      coach("UNPAID COACH"), // no allowance entered
    ];
    const { links, unmatchedCoaches, orphanRecs } = reconcileAllowances(list, coaches);
    expect(links.map((l) => l.method)).toEqual(["normalized", "alias", "coachId"]);
    expect(unmatchedCoaches.map((c) => c.canonicalName)).toEqual(["UNPAID COACH"]);
    expect(orphanRecs.map((r) => r.canonicalName)).toEqual(["Nobody This Month"]);
  });

  it("never links one record to two coaches", () => {
    const list = [rec("SAM", { coachId: 1 })];
    const coaches = [coach("SAM", { coachId: 1 }), coach("SAM")];
    const { links, unmatchedCoaches } = reconcileAllowances(list, coaches);
    expect(links).toHaveLength(1);
    expect(unmatchedCoaches).toHaveLength(1);
  });

  it("a strong coachId match beats an earlier weak exact-name match (regression for fix #5)", () => {
    // SAM appears first and would grab the record by exact NAME (weak), but BOB
    // is the record's true coachId owner (strong). Global best-match-first
    // assignment must give the record to BOB and leave SAM unmatched, regardless
    // of input order — the old input-order greedy loop got this wrong.
    const list = [rec("SAM", { coachId: 9 })];
    const coaches = [coach("SAM"), coach("BOB", { coachId: 9 })];
    const { links, unmatchedCoaches } = reconcileAllowances(list, coaches);
    expect(links).toHaveLength(1);
    expect(links[0].coach.canonicalName).toBe("BOB");
    expect(links[0].method).toBe("coachId");
    expect(unmatchedCoaches.map((c) => c.canonicalName)).toEqual(["SAM"]);
  });
});
