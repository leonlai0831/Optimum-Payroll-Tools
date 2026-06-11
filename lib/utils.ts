import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as RM currency (no decimals). */
export function rm(n: number): string {
  return `RM ${Math.round(n).toLocaleString("en-MY")}`;
}

/** Format a number as RM currency with cents (commission needs exact ringgit/sen). */
export function rm2(n: number): string {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Deterministic date formatting for UI labels: a FIXED locale (en-MY, the
 * operator's) and FIXED timezone (Asia/Kuala_Lumpur — Vercel functions are
 * pinned to sin1 but their clock is UTC). Bare `toLocaleDateString()` picks the
 * runtime's locale/TZ, so a server render and the client hydration could
 * disagree (hydration warnings; dates flipping near midnight UTC). Accepts the
 * Date | string | number that DB rows and serialized props actually carry.
 */
const DATE_FMT = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const DATE_TIME_FMT = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "11/06/2026" — hydration-safe date label. */
export function formatDate(d: Date | string | number): string {
  return DATE_FMT.format(new Date(d));
}

/** "11/06/2026, 09:30 pm" — hydration-safe date-time label. */
export function formatDateTime(d: Date | string | number): string {
  return DATE_TIME_FMT.format(new Date(d));
}

/**
 * Neutralize spreadsheet/CSV formula injection in user-derived TEXT values.
 * If a string starts with a character a spreadsheet would treat as a formula
 * (`=`, `+`, `-`, `@`) or a control character (tab, CR, LF) that can break out
 * of a cell, prefix it with an apostrophe so it's rendered as literal text.
 * Apply only to user-supplied text (names, plan labels) — never to numbers,
 * headers, or values we generate ourselves.
 */
export function sanitizeSpreadsheetText(value: string): string {
  return /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
}

/**
 * Centers are stored on a coach / saved-allowance row as a single comma-joined
 * string (e.g. "QSM, BK"); the UI / CSV split that into up to 3 slots. Trims
 * each piece and drops blanks.
 */
export function splitCenters(center: string | null | undefined): string[] {
  return (center ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}
