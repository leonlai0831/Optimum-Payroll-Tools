/**
 * Center-name normalization. Uploaded KPI center labels are a mix of operator
 * codes (HQ, PJ) and full names (Subang USJ, Berkeley); this maps a raw value
 * onto the operator's configured center code when it matches a code or one of
 * that code's aliases, otherwise it keeps the (trimmed) raw value.
 *
 * Matching is case-insensitive. A code match wins over an alias match.
 */
export function normalizeCenter(
  raw: string,
  centers: string[],
  centerAliases: Record<string, string[]>,
): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return trimmed;

  const lower = trimmed.toLowerCase();

  // Exact code match (case-insensitive) — return the canonical code as configured.
  const codeMatch = centers.find((c) => c.toLowerCase() === lower);
  if (codeMatch) return codeMatch;

  // Alias match — return the code whose alias list contains this value.
  for (const [code, aliases] of Object.entries(centerAliases ?? {})) {
    if (aliases?.some((a) => a.trim().toLowerCase() === lower)) return code;
  }

  return trimmed;
}

/**
 * Build a reusable normalizer bound to a config, for hot paths that normalize
 * many rows (avoids re-scanning the centers/aliases on every call).
 */
export function makeCenterNormalizer(
  centers: string[],
  centerAliases: Record<string, string[]>,
): (raw: string) => string {
  const codeByLower = new Map(centers.map((c) => [c.toLowerCase(), c] as const));
  const codeByAlias = new Map<string, string>();
  for (const [code, aliases] of Object.entries(centerAliases ?? {})) {
    for (const a of aliases ?? []) {
      const key = a.trim().toLowerCase();
      if (key && !codeByAlias.has(key)) codeByAlias.set(key, code);
    }
  }
  return (raw: string) => {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return trimmed;
    const lower = trimmed.toLowerCase();
    return codeByLower.get(lower) ?? codeByAlias.get(lower) ?? trimmed;
  };
}
