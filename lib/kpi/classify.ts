/**
 * Account classification for the KPI name pass.
 *
 * A monthly CSV contains rows that aren't all "a coach's own teaching": numbered
 * overflow classes (COBYS 2), branch/promo placeholders (HARVEST, PAY-AS-YOU-GO),
 * and co-taught classes (HONG LI / AARON). This module decides, per raw account
 * name, what kind of row it is and what its base coach name is — so the engine
 * can include/exclude each correctly. Every rule here is data-driven by
 * `ClassifyConfig` so it stays editable in Settings (the whitelist especially).
 */

export type AccountKind = "primary" | "numbered" | "placeholder" | "coteach";

export interface ClassifyConfig {
  /**
   * Class-type codes (NOT names) that may trail a name after "_" or " - ",
   * e.g. "LMHA", "YL", "FULL". Stripped when resolving the base coach name.
   * Editable in Settings. Compared case-insensitively.
   */
  classCodes: string[];
  /**
   * Substrings (upper-cased) that mark a row as a center/promo placeholder
   * rather than a person — excluded from individual KPI, counted toward the
   * center's group score.
   */
  placeholderMarkers: string[];
  /**
   * Center abbreviations as they appear in account names (e.g. "USJ", "QSM").
   * Used to strip a center suffix that wasn't bracketed, e.g. the trailing
   * "USJ" in "ETHAN - SHREYA [L] USJ". Compared case-insensitively.
   */
  centerCodes: string[];
}

export const DEFAULT_CLASSIFY_CONFIG: ClassifyConfig = {
  // Y/L/M/H/A combinations seen in real data, plus FULL ("teaches any class type")
  // and YS (young swimmer). Order-independent; matched case-insensitively.
  classCodes: [
    "L", "M", "H", "A", "Y",
    "YL", "YM", "LM", "MH", "LH",
    "LMH", "LMA", "LMHA", "LMHY", "LMY",
    "YLM", "YLMH", "YLMHA",
    "YS", "FULL",
    // Special programmes are a coach's own class type, not a co-teaching partner.
    "PRE-COMPETITIVE", "PRE-COMPETITION", "LIFE SAVING", "LIFESAVING",
  ],
  placeholderMarkers: [
    "HARVEST",
    "PAY-AS-YOU-GO",
    "PAY AS YOU GO",
    "YEAR_END_PROMO",
    "YEAR END PROMO",
    "NEW CLASS",
    "EXCLUSIVE",
    "ADVANCE PROGRAM",
    "PROMO",
  ],
  // Center abbreviations as written in the CSV name column.
  centerCodes: ["HQ", "BK", "BT", "KK", "KM", "PJ", "PK", "QSM", "USJ"],
}

export interface ClassifiedAccount {
  /** The original CSV account name (verbatim). */
  raw: string;
  kind: AccountKind;
  /** Resolved base coach name (UPPER), after stripping center + class codes. */
  baseName: string;
  /** For numbered rows: the trailing number (COBYS 2 → 2). */
  seq?: number;
  /** For co-teach rows: the distinct person names sharing the class (UPPER). */
  coaches?: string[];
  /** Whether this row counts toward individual KPI by default. */
  defaultInclude: boolean;
}

/**
 * Strip trailing center / class-code suffixes. Handles three shapes, repeating
 * until none remain (some accounts carry two, e.g. "CHIE WEN [YLMH] [KK]"):
 *  - bracketed: "[KK]", "(BT)"
 *  - bare center token written after a bracket, e.g. the "USJ" in
 *    "ETHAN - SHREYA [L] USJ"
 */
function stripCenter(name: string, centers: Set<string>): string {
  let s = name.trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\s*[[(][^\])]*[\])]\s*$/, "").trim();
    const bare = s.match(/^(.*\S)\s+([A-Za-z]{2,4})$/);
    if (bare && centers.has(bare[2].toUpperCase())) s = bare[1].trim();
  } while (s !== prev && s.length > 0);
  return s;
}

/** Strip a leading "(COLOUR)" prefix (Kemuning convention). */
function stripColorPrefix(name: string): string {
  return name.replace(/^\s*\([^)]*\)\s*/g, "").trim();
}

/**
 * Whether a trailing segment is (entirely) class codes. Handles a single code
 * ("LMHA"), and space-separated stacked codes ("YS L" = young-swimmer + L) by
 * requiring every token to be whitelisted.
 */
function isClassCode(segment: string, codes: Set<string>): boolean {
  const tokens = segment.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  // First try the whole segment collapsed (e.g. "LM H" written as one code).
  if (codes.has(tokens.join(""))) return true;
  // Else every token must individually be a class code.
  return tokens.every((t) => codes.has(t));
}

/**
 * Resolve the base coach name from an account by removing the center suffix, a
 * leading colour prefix, and any trailing class-type code (after "_" or " - ").
 * A trailing segment is only stripped when it's in the whitelist — so real name
 * parts like "- AARON" survive.
 */
function resolveBase(name: string, codes: Set<string>, centers: Set<string>): string {
  let s = stripColorPrefix(stripCenter(name, centers));

  // Trailing "_CODE" (possibly "_YS L" with an inner space).
  const us = s.match(/^(.*?)_\s*([A-Za-z][A-Za-z ,]*)$/);
  if (us && isClassCode(us[2], codes)) s = us[1].trim();

  // Trailing " - CODE": allow multi-word ("LIFE SAVING") and hyphenated
  // ("PRE-COMPETITIVE") codes, stripped only when whitelisted.
  const dash = s.match(/^(.*?)\s*-\s*([A-Za-z][A-Za-z \-]*)$/);
  if (dash && isClassCode(dash[2], codes)) s = dash[1].trim();

  // Drop any leftover separator punctuation, e.g. "JING CHYI-" -> "JING CHYI".
  return s.replace(/^[\s\-]+|[\s\-]+$/g, "").toUpperCase();
}

/** Split a co-teach name into its person tokens, or null if not a co-teach. */
function splitCoteach(name: string, codes: Set<string>, centers: Set<string>): string[] | null {
  const s = stripColorPrefix(stripCenter(name, centers));
  // Slash always denotes two people sharing a class.
  if (s.includes("/")) {
    const parts = s
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => resolveBase(p, codes, centers));
    return parts.length >= 2 ? [...new Set(parts)] : null;
  }
  // "A - B" where B is NOT a class code is a co-teach (two names).
  const dash = s.match(/^(.*?)\s+-\s+(.+)$/);
  if (dash && !isClassCode(dash[2], codes)) {
    const a = resolveBase(dash[1], codes, centers);
    const b = resolveBase(dash[2], codes, centers);
    if (a && b && a !== b) return [a, b];
  }
  return null;
}

const hasPlaceholderMarker = (name: string, markers: string[]) => {
  const up = name.toUpperCase();
  return markers.some((m) => up.includes(m.toUpperCase()));
};

/** Classify one raw account name under the given config. */
export function classifyAccount(raw: string, config: ClassifyConfig): ClassifiedAccount {
  const codes = new Set(config.classCodes.map((c) => c.toUpperCase().replace(/\s+/g, "")));
  const centers = new Set(config.centerCodes.map((c) => c.toUpperCase()));

  if (hasPlaceholderMarker(raw, config.placeholderMarkers)) {
    return {
      raw,
      kind: "placeholder",
      baseName: resolveBase(raw, codes, centers),
      defaultInclude: false,
    };
  }

  const coaches = splitCoteach(raw, codes, centers);
  if (coaches) {
    return { raw, kind: "coteach", baseName: coaches[0], coaches, defaultInclude: false };
  }

  // A trailing standalone number splits overflow classes from the primary.
  // Real data uses both "COBYS" + "COBYS 2" and "IQ 1" + "IQ 2", so seq 1 is
  // the primary holder and seq ≥ 2 is excluded overflow — both attributed to
  // the same base name so they merge onto one coach.
  const base = resolveBase(raw, codes, centers);
  const numbered = base.match(/^(.*?)[\s]+(\d+)$/);
  if (numbered) {
    const seq = Number(numbered[2]);
    const baseName = numbered[1].trim();
    if (seq >= 2) {
      return { raw, kind: "numbered", baseName, seq, defaultInclude: false };
    }
    return { raw, kind: "primary", baseName, seq, defaultInclude: true };
  }

  return { raw, kind: "primary", baseName: base, defaultInclude: true };
}

/** Classify a batch of account names. */
export function classifyAccounts(
  names: string[],
  config: ClassifyConfig = DEFAULT_CLASSIFY_CONFIG,
): ClassifiedAccount[] {
  return names.map((n) => classifyAccount(n, config));
}
