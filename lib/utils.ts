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
