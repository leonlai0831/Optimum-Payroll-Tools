import type { InstructorRow } from "./types";

type RawRow = Record<string, unknown>;

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Canonical field -> accepted header variants (matched after normalization). */
const HEADER_MAP: Record<keyof InstructorRow | "_skip", string[]> = {
  Center: ["center", "centre", "branch", "location", "cr_name", "crname"],
  Instructor: [
    "instructor", "instructorname", "coach", "coachname", "trainer",
    "name", "instructor name", "tr_name", "trname",
  ],
  TotalStudent: ["totalstudent", "totalstudents", "students", "pax", "total student", "total_student", "ttllvl", "ttl-lvl"],
  TotalColor: ["totalcolor", "totalcolour", "colour", "color", "total color", "ttlcolor", "ttl-color"],
  Black: ["black", "blackcap"],
  LevelUp: ["levelup", "levelups", "upgrade", "upgrades", "level up", "up"],
  Downgrade: ["down", "downgrade", "downgrades"],
  Switch: ["switch", "switches", "switched"],
  Stop: ["stop", "stopped", "drop", "dropout", "student_stop", "studentstop"],
  Attended: ["attended", "attendance", "present", "student_attended_class", "studentattendedclass"],
  _skip: [],
};

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Map arbitrary CSV rows (already parsed to objects) to canonical InstructorRow.
 * Ported from KPI_Calculator_v11.1 `mapCsvHeaders`, extended with Downgrade/Switch.
 */
export function mapCsvRows(rows: RawRow[]): InstructorRow[] {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const resolved: Partial<Record<keyof InstructorRow, string>> = {};

  (Object.keys(HEADER_MAP) as (keyof InstructorRow)[]).forEach((field) => {
    if ((field as string) === "_skip") return;
    const variants = new Set(HEADER_MAP[field].map(normalize));
    const match = headers.find((h) => variants.has(normalize(h)));
    if (match) resolved[field] = match;
  });

  return rows.map((row) => ({
    Center: String(resolved.Center ? row[resolved.Center] ?? "Unknown" : "Unknown") || "Unknown",
    Instructor:
      String(resolved.Instructor ? row[resolved.Instructor] ?? "Unknown" : "Unknown") || "Unknown",
    TotalStudent: toNum(resolved.TotalStudent && row[resolved.TotalStudent]),
    TotalColor: toNum(resolved.TotalColor && row[resolved.TotalColor]),
    Black: toNum(resolved.Black && row[resolved.Black]),
    LevelUp: toNum(resolved.LevelUp && row[resolved.LevelUp]),
    Downgrade: toNum(resolved.Downgrade && row[resolved.Downgrade]),
    Switch: toNum(resolved.Switch && row[resolved.Switch]),
    Stop: toNum(resolved.Stop && row[resolved.Stop]),
    Attended: toNum(resolved.Attended && row[resolved.Attended]),
  }));
}

/**
 * Heuristic canonical name: strip "[...]" suffixes and " - ..." suffixes, upper-case.
 * Ported from v11.1 `getCleanName`. Used as the deterministic first pass before
 * AI reconciliation.
 */
export function getCleanName(rawName: unknown): string {
  if (!rawName) return "Unknown";
  let name = String(rawName);
  name = name.split("[")[0];
  name = name.split(" - ")[0];
  return name.trim().toUpperCase();
}
