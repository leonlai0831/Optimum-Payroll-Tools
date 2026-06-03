import { describe, expect, it } from "vitest";
import {
  classifyAccount,
  classifyAccounts,
  DEFAULT_CLASSIFY_CONFIG,
  type ClassifyConfig,
} from "./classify";

const c = (raw: string) => classifyAccount(raw, DEFAULT_CLASSIFY_CONFIG);

describe("classifyAccount — base name resolution (real names)", () => {
  it("strips [center] and (center) suffixes", () => {
    expect(c("COBYS [BK]").baseName).toBe("COBYS");
    expect(c("DEEPA (HQ)").baseName).toBe("DEEPA");
    expect(c("CHLOE (PJ)").baseName).toBe("CHLOE");
  });

  it("strips class-code suffixes after _ and after - (whitelist only)", () => {
    expect(c("WAN YING_YLMH [HQ]").baseName).toBe("WAN YING");
    expect(c("KER XIN_YS L [BK]").baseName).toBe("KER XIN");
    expect(c("HEMARAJ - LMHA [QSM]").baseName).toBe("HEMARAJ");
    expect(c("KEN - LMHY [KM]").baseName).toBe("KEN");
    expect(c("KEN-L [USJ]").baseName).toBe("KEN");
    expect(c("NINI - FULL [PK]").baseName).toBe("NINI"); // FULL = teaches any class type
  });

  it("strips the (COLOUR) prefix used at Kemuning", () => {
    expect(c("(PINK) SIEW YEN [KK]").baseName).toBe("SIEW YEN");
    expect(c("(MAROON) CHIE WEN [YLMH] [KK]").baseName).toBe("CHIE WEN");
  });

  it("merges base names across centers (same person → same baseName)", () => {
    // Merge is the engine's job, but the base name must agree for it to happen.
    expect(c("WAN YING [BK]").baseName).toBe(c("WAN YING_YLMH [HQ]").baseName);
    expect(c("VASSEN [BK]").baseName).toBe(c("VASSEN [HQ]").baseName);
  });
});

describe("classifyAccount — kinds", () => {
  it("numbered variants are excluded by default, attributed to the base", () => {
    const r = c("COBYS 2 [BK]");
    expect(r.kind).toBe("numbered");
    expect(r.baseName).toBe("COBYS");
    expect(r.seq).toBe(2);
    expect(r.defaultInclude).toBe(false);
    expect(c("IQ 2 [BT]").kind).toBe("numbered");
    expect(c("THING WAI 2 [BT]").kind).toBe("numbered");
  });

  it("a plain name with no number is primary and included", () => {
    expect(c("COBYS [BK]").kind).toBe("primary");
    expect(c("COBYS [BK]").defaultInclude).toBe(true);
    // "THING WAI 1" — seq 1 is the primary count holder, not a numbered overflow.
    expect(c("THING WAI 1 [BT]").kind).toBe("primary");
  });

  it("seq-1 primary and seq-2 overflow share a base name so they merge", () => {
    // Real data: "IQ 1 (BT)" (parens!) is the primary, "IQ 2 [BT]" the overflow.
    const one = c("IQ 1 (BT)");
    const two = c("IQ 2 [BT]");
    expect(one.kind).toBe("primary");
    expect(one.baseName).toBe("IQ");
    expect(two.kind).toBe("numbered");
    expect(two.baseName).toBe("IQ");
    expect(one.baseName).toBe(two.baseName);
    // Mixed shape: "COBYS" (no number) still merges with "COBYS 2".
    expect(c("COBYS [BK]").baseName).toBe(c("COBYS 2 [BK]").baseName);
  });

  it("placeholders/promo rows are excluded from individual KPI", () => {
    for (const name of [
      "HONG LI HARVEST",
      "PAY-AS-YOU-GO [BK]",
      "YEAR_END_PROMO [BK]",
      "NEW CLASS [PK]",
      "EXCLUSIVE 1-1 CLASS [HQ]",
      "ADVANCE PROGRAM WEEKEND [WEN FHONG]",
    ]) {
      const r = c(name);
      expect(r.kind, name).toBe("placeholder");
      expect(r.defaultInclude, name).toBe(false);
    }
  });

  it("a named placeholder attributes to its coach; a pure one is empty", () => {
    expect(c("COBYS HARVEST").baseName).toBe("COBYS");
    expect(c("WAN YING HARVEST").baseName).toBe("WAN YING");
    expect(c("PAY-AS-YOU-GO [BK]").baseName).toBe("");
  });

  it("slash co-teach lists both people; excluded by default", () => {
    const r = c("(PURPLE) HARVARD / AARON [KK]");
    expect(r.kind).toBe("coteach");
    expect(r.coaches).toContain("HARVARD");
    expect(r.coaches).toContain("AARON");
    expect(r.defaultInclude).toBe(false);
  });

  it("dash-with-a-real-name is a co-teach (name not in whitelist)", () => {
    const r = c("AH ANN - JUN MIN [BT]");
    expect(r.kind).toBe("coteach");
    expect(r.coaches).toEqual(["AH ANN", "JUN MIN"]);
  });

  it("does NOT treat a class code as a co-teach partner", () => {
    // "MARCUS KOH - L" → L is a class code, so this is primary MARCUS KOH.
    const r = c("MARCUS KOH - L [BT]");
    expect(r.kind).toBe("primary");
    expect(r.baseName).toBe("MARCUS KOH");
  });

  it("special programmes are a coach's own class type, not a co-teach", () => {
    // PRE-COMPETITIVE / LIFE SAVING belong to the named coach (ANWAR / CHEE XUAN).
    const a = c("ANWAR - PRE-COMPETITIVE [QSM]");
    expect(a.kind).toBe("primary");
    expect(a.baseName).toBe("ANWAR");
    const b = c("CHEE XUAN - LIFE SAVING [QSM]");
    expect(b.kind).toBe("primary");
    expect(b.baseName).toBe("CHEE XUAN");
  });

  it("AARON (QSM/KK branch manager) is a real co-teach partner", () => {
    for (const name of ["AFFAN / AARON [QSM]", "(WHITE) ERNEST / AARON [KK]"]) {
      const r = c(name);
      expect(r.kind, name).toBe("coteach");
      expect(r.coaches, name).toContain("AARON");
    }
  });

  it("cleans messy USJ hyphen/bracket names down to two people", () => {
    expect(c("ETHAN - SHREYA [L] USJ").coaches).toEqual(["ETHAN", "SHREYA"]);
    expect(c("JOSHUA - JING CHYI-[L]").coaches).toEqual(["JOSHUA", "JING CHYI"]);
    expect(c("JOSHUA - YUE NING-YLM [USJ]").coaches).toEqual(["JOSHUA", "YUE NING"]);
  });
});

describe("classifyAccount — configurable whitelist", () => {
  it("respects an edited class-code list", () => {
    // Remove FULL from the whitelist → "- FULL" is now treated as a co-teach name.
    const cfg: ClassifyConfig = {
      ...DEFAULT_CLASSIFY_CONFIG,
      classCodes: DEFAULT_CLASSIFY_CONFIG.classCodes.filter((x) => x !== "FULL"),
    };
    const r = classifyAccount("NINI - FULL [PK]", cfg);
    expect(r.kind).toBe("coteach");
    expect(r.coaches).toEqual(["NINI", "FULL"]);
  });

  it("respects an added placeholder marker", () => {
    const cfg: ClassifyConfig = {
      ...DEFAULT_CLASSIFY_CONFIG,
      placeholderMarkers: [...DEFAULT_CLASSIFY_CONFIG.placeholderMarkers, "TRIAL"],
    };
    expect(classifyAccount("SOMEONE TRIAL [BK]", cfg).kind).toBe("placeholder");
  });
});

describe("classifyAccounts — batch over the real April roster sample", () => {
  it("classifies a representative slice without crashing and with sane splits", () => {
    const sample = [
      "COBYS [BK]", "COBYS 2 [BK]", "COBYS HARVEST",
      "WAN YING [BK]", "WAN YING_YLMH [HQ]", "WAN YING HARVEST",
      "(PINK) SIEW YEN [KK]", "(PURPLE) HARVARD / AARON [KK]",
      "PAY-AS-YOU-GO [HQ]", "MARCUS KOH - L [BT]",
    ];
    const out = classifyAccounts(sample);
    const byRaw = Object.fromEntries(out.map((o) => [o.raw, o]));
    expect(byRaw["COBYS [BK]"].kind).toBe("primary");
    expect(byRaw["COBYS 2 [BK]"].kind).toBe("numbered");
    expect(byRaw["COBYS HARVEST"].kind).toBe("placeholder");
    expect(byRaw["WAN YING_YLMH [HQ]"].baseName).toBe("WAN YING");
    expect(byRaw["(PURPLE) HARVARD / AARON [KK]"].kind).toBe("coteach");
    expect(byRaw["MARCUS KOH - L [BT]"].kind).toBe("primary");
    // Default-include = the primaries: COBYS, WAN YING ×2 (BK + HQ), SIEW YEN, MARCUS KOH.
    expect(out.filter((o) => o.defaultInclude).length).toBe(5);
  });
});
