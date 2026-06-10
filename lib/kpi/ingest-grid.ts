import type { InstructorRow } from "./types";

/**
 * Pure helpers for the ingest spreadsheet grid (components/kpi-ingest-editor.tsx).
 *
 * The grid filters and sorts a *view* of the rows while edits/saves always apply
 * to the FULL set — so every row carries a stable client-side `id` that survives
 * filtering, sorting, and deletion. Edits are keyed by that id, never by the
 * visible position.
 */

/** One spreadsheet row: stable identity + the editable data. */
export interface IngestGridRow {
  /** Stable client-side id (NOT the display position). */
  id: number;
  data: InstructorRow;
}

/** Wrap raw rows with stable ids (0..n-1; new rows continue the sequence). */
export function toGridRows(rows: InstructorRow[]): IngestGridRow[] {
  return rows.map((data, id) => ({ id, data }));
}

/**
 * Case-insensitive Instructor/Center substring filter. Display-only: callers
 * keep editing/saving the full set. Empty query returns the input array as-is.
 */
export function filterGridRows(rows: IngestGridRow[], query: string): IngestGridRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.data.Instructor.toLowerCase().includes(q) || r.data.Center.toLowerCase().includes(q),
  );
}

export type SortDir = "asc" | "desc" | null;

/**
 * Sort by Instructor (case-insensitive); `null` keeps the original order.
 * Display-only and non-mutating — the underlying row order (what gets saved)
 * never changes.
 */
export function sortGridRows(rows: IngestGridRow[], dir: SortDir): IngestGridRow[] {
  if (!dir) return rows;
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      sign *
      a.data.Instructor.localeCompare(b.data.Instructor, undefined, { sensitivity: "base" }),
  );
}

/** Parse a numeric cell commit; anything non-finite (or empty) becomes 0. */
export function parseNumericCell(raw: string): number {
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : 0;
}
