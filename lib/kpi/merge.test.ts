import { describe, expect, it } from "vitest";
import { buildGroups } from "./merge";

/** Find the group whose canonical name matches. */
const group = (groups: ReturnType<typeof buildGroups>, name: string) =>
  groups.find((g) => g.canonicalName === name);

describe("buildGroups — classifier-driven grouping", () => {
  it("pulls numbered overflow + HARVEST into the base coach", () => {
    const groups = buildGroups({
      names: ["COBYS [BK]", "COBYS 2 [BK]", "COBYS HARVEST"],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].canonicalName).toBe("COBYS");
    expect(groups[0].accounts).toHaveLength(3);
    expect(new Set(groups[0].accounts)).toEqual(
      new Set(["COBYS [BK]", "COBYS 2 [BK]", "COBYS HARVEST"]),
    );
  });

  it("merges seq-1 primary with seq-2 overflow (IQ 1 (BT) + IQ 2 [BT])", () => {
    const groups = buildGroups({ names: ["IQ 1 (BT)", "IQ 2 [BT]"] });
    expect(groups).toHaveLength(1);
    expect(groups[0].canonicalName).toBe("IQ");
  });

  it("merges the same coach across centers and class-code suffixes", () => {
    const groups = buildGroups({
      names: ["WAN YING [BK]", "WAN YING_YLMH [HQ]"],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].canonicalName).toBe("WAN YING");
  });

  it("keeps two genuinely different coaches apart", () => {
    const groups = buildGroups({ names: ["COBYS [BK]", "VASSEN [HQ]"] });
    expect(groups).toHaveLength(2);
    expect(group(groups, "COBYS")).toBeTruthy();
    expect(group(groups, "VASSEN")).toBeTruthy();
  });

  it("files a co-teach under its first-named coach (not AARON)", () => {
    // AARON (branch manager) is the second name; the class lands under ANWAR,
    // who can hand it to AARON later via the merge editor.
    const groups = buildGroups({ names: ["ANWAR [QSM]", "ANWAR / AARON [QSM]"] });
    expect(groups).toHaveLength(1);
    expect(groups[0].canonicalName).toBe("ANWAR");
    expect(groups[0].accounts).toContain("ANWAR / AARON [QSM]");
  });

  it("still honors known aliases and AI clusters", () => {
    const aliased = buildGroups({
      names: ["JoJo [BK]", "JONATHAN [HQ]"],
      knownCoaches: [{ canonicalName: "JONATHAN", aliases: ["JoJo [BK]", "JONATHAN [HQ]"] }],
    });
    expect(aliased).toHaveLength(1);
    expect(aliased[0].canonicalName).toBe("JONATHAN");

    const aiMerged = buildGroups({
      names: ["RAYMOND [BK]", "RAY [HQ]"],
      aiClusters: [["RAYMOND [BK]", "RAY [HQ]"]],
    });
    expect(aiMerged).toHaveLength(1);
  });
});
