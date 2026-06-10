import { beforeAll, describe, expect, it } from "vitest";
import { findAliasConflict, findDuplicateAliases } from "./alias-conflicts";

// The PGlite-backed wrapper (findCoachAliasConflict) is tested here too — use
// an in-memory DB so this file never touches the on-disk dev database.
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

describe("findDuplicateAliases", () => {
  it("returns [] when every alias belongs to one profile", () => {
    expect(
      findDuplicateAliases([
        { canonicalName: "ARIF", aliases: ["ARIF - LMY [PK]", "ARIF [PK]"] },
        { canonicalName: "AKMAL", aliases: ["AKMAL [PK]"] },
      ]),
    ).toEqual([]);
  });

  it("flags an alias claimed by two profiles, naming both owners", () => {
    // The real incident: one account on two profiles forked the histories.
    expect(
      findDuplicateAliases([
        { canonicalName: "ARIF", aliases: ["ARIF - LMY [PK]"] },
        { canonicalName: "ARIF LMY", aliases: ["ARIF - LMY [PK]", "ARIF LMY [PK]"] },
      ]),
    ).toEqual([{ alias: "ARIF - LMY [PK]", owners: ["ARIF", "ARIF LMY"] }]);
  });

  it("matches case- and whitespace-insensitively", () => {
    const dups = findDuplicateAliases([
      { canonicalName: "A", aliases: ["Hong Li [BK]"] },
      { canonicalName: "B", aliases: ["  HONG LI [BK] "] },
    ]);
    expect(dups).toHaveLength(1);
    expect(dups[0].owners).toEqual(["A", "B"]);
  });

  it("does not flag the same alias listed twice on ONE profile", () => {
    expect(
      findDuplicateAliases([{ canonicalName: "A", aliases: ["X [BK]", "x [bk]"] }]),
    ).toEqual([]);
  });
});

describe("findAliasConflict", () => {
  const profiles = [
    { id: 1, canonicalName: "ARIF", aliases: ["ARIF - LMY [PK]"] },
    { id: 2, canonicalName: "AKMAL", aliases: ["AKMAL [PK]"] },
  ];

  it("allows free aliases and the coach's own names", () => {
    expect(findAliasConflict(2, ["AKMAL [PK]", "AKMAL HARVEST"], profiles)).toBeNull();
    expect(findAliasConflict(1, ["ARIF - LMY [PK]", "ARIF"], profiles)).toBeNull();
  });

  it("rejects an alias already on a different coach (case-insensitive)", () => {
    expect(findAliasConflict(2, ["arif - lmy [pk]"], profiles)).toEqual({
      alias: "arif - lmy [pk]",
      ownerName: "ARIF",
    });
  });

  it("rejects an alias equal to another coach's canonical name", () => {
    expect(findAliasConflict(1, ["AKMAL"], profiles)).toEqual({
      alias: "AKMAL",
      ownerName: "AKMAL",
    });
  });
});

describe("findCoachAliasConflict (PGlite in-memory)", () => {
  let queries: typeof import("../db/queries");
  let arifId: number;
  let akmalId: number;

  beforeAll(async () => {
    queries = await import("../db/queries");
    arifId = (await queries.createCoach({ canonicalName: "ARIF", center: "Puchong Kinrara" })).id;
    akmalId = (await queries.createCoach({ canonicalName: "AKMAL", center: "Puchong Kinrara" })).id;
    await queries.updateCoachAliases(arifId, ["ARIF - LMY [PK]"]);
  });

  it("returns null for free aliases and for re-saving a coach's own alias", async () => {
    expect(await queries.findCoachAliasConflict(akmalId, ["AKMAL [PK]"])).toBeNull();
    expect(await queries.findCoachAliasConflict(arifId, ["ARIF - LMY [PK]"])).toBeNull();
  });

  it("names the alias and owner when another coach already claims it", async () => {
    expect(await queries.findCoachAliasConflict(akmalId, ["ARIF - LMY [PK]"])).toEqual({
      alias: "ARIF - LMY [PK]",
      ownerName: "ARIF",
    });
  });

  it("treats another coach's canonical name as taken", async () => {
    expect((await queries.findCoachAliasConflict(akmalId, ["arif"]))?.ownerName).toBe("ARIF");
  });
});
