import Papa from "papaparse";

/**
 * Raw-CSV support for the machine ingest endpoint: an external sender can POST
 * the monthly export file directly (`Content-Type: text/csv`) instead of
 * wrapping rows in JSON. These helpers are pure (string in, rows out) so they
 * unit-test without a Request or a database.
 */

/** Outcome of parsing a CSV request body into raw header→value row objects. */
export type CsvBodyResult =
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; error: string };

/**
 * Which parser `POST /api/ingest/kpi` should use for a request body.
 * - `text/csv` (any charset param) → CSV.
 * - Missing content type or `application/octet-stream` → sniff: JSON when the
 *   body parses as JSON, otherwise CSV.
 * - Anything else (incl. `application/json`) → JSON, the original behavior.
 */
export function resolveIngestBodyMode(
  contentType: string | null | undefined,
  bodyText: string,
): "json" | "csv" {
  const mime = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (mime === "text/csv") return "csv";
  if (mime === "" || mime === "application/octet-stream") {
    return looksLikeJson(bodyText) ? "json" : "csv";
  }
  return "json";
}

/** True when the body is parseable JSON (used only for the content-type sniff). */
function looksLikeJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a raw CSV body into row objects keyed by the header line — the same
 * shape PapaParse produces for the dashboard's file upload, so the result feeds
 * straight into `hasInstructorHeader` / `mapCsvRows`. A header row is required
 * and empty lines are skipped. Returns a caller-facing error (not an exception)
 * for an empty body, a header-only file, or structurally broken CSV.
 */
export function parseCsvBody(text: string): CsvBodyResult {
  const stripped = text.replace(/^\uFEFF/, ""); // Excel exports lead with a BOM
  if (!stripped.trim()) {
    return { ok: false, error: "CSV body is empty." };
  }

  const res = Papa.parse<Record<string, unknown>>(stripped, {
    header: true,
    skipEmptyLines: true,
  });

  // Quotes/Delimiter errors mean the file is structurally broken — reject with
  // the row number. FieldMismatch (a row with extra/missing cells) is tolerated,
  // matching the dashboard upload, which ignores it.
  const fatal = res.errors.find((e) => e.type === "Quotes" || e.type === "Delimiter");
  if (fatal) {
    const where = typeof fatal.row === "number" ? ` (data row ${fatal.row + 1})` : "";
    return { ok: false, error: `CSV could not be parsed: ${fatal.message}${where}.` };
  }
  if (res.data.length === 0) {
    return { ok: false, error: "CSV has a header row but no data rows." };
  }
  return { ok: true, rows: res.data };
}
