/**
 * Period helpers. A period label is "YYYY-MM" (e.g. "2026-06") — the unit every
 * allowance record is filed under. Kept tiny and pure so both the server guard
 * and the UI can share the exact same month math.
 */

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** True when `period` is a well-formed "YYYY-MM" label with a real month (01–12). */
export function isValidPeriod(period: string): boolean {
  return PERIOD_RE.test(period);
}

/** The calendar month before `period`. "2026-01" → "2025-12". Throws on bad input. */
export function previousPeriod(period: string): string {
  if (!isValidPeriod(period)) throw new Error(`Invalid period: ${period}`);
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** The calendar month after `period`. "2026-12" → "2027-01". Throws on bad input. */
export function nextPeriod(period: string): string {
  if (!isValidPeriod(period)) throw new Error(`Invalid period: ${period}`);
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** This month as a period label, in local time. */
export function currentPeriod(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
