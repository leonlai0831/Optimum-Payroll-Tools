/**
 * Pure parser for the "Bulk add users" file upload (CSV or Excel). The file is
 * read into a 2D grid of cells by the client (PapaParse for CSV, ExcelJS for a
 * workbook); this module turns that grid into `{ email, name }` rows. The `name`
 * is the person's full/legal name (it lands in the account's Full Name field).
 *
 * Header handling is forgiving so an operator can upload an export from anywhere:
 *  - If the first non-empty row names an "email" column, columns are mapped by
 *    header (email + a name column, in any order), data starts below it.
 *  - Otherwise there is no header: column 0 is the email, column 1 the name.
 * Rows without an email cell are dropped; whitespace is trimmed.
 */

export type ParsedUserRow = { email: string; name: string };

/** Loose email shape — the same check the bulk UI used for its "valid" count. */
export const EMAIL_RE = /.+@.+\..+/;

type Cell = string | number | boolean | null | undefined;

function cellText(c: Cell): string {
  if (c === null || c === undefined) return "";
  return String(c).trim();
}

/** Does this row carry any content at all? */
function rowHasContent(row: Cell[]): boolean {
  return row.some((c) => cellText(c) !== "");
}

/** Pick the name column from a header row: prefer an explicit full/legal name
 *  (that's where the value lands), then any other name column, never the email
 *  column itself. */
function findNameColumn(header: string[], emailCol: number): number {
  const norm = header.map((h) => h.toLowerCase());
  const prefer = (re: RegExp) =>
    norm.findIndex((h, i) => i !== emailCol && re.test(h));
  for (const re of [/full\s*name|legal\s*name/, /\bname\b/, /name/]) {
    const i = prefer(re);
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * Convert a raw cell grid (from a CSV or worksheet) into user rows.
 * Exported pure so the column-mapping logic is unit-locked; the file I/O lives
 * in the client component.
 */
export function rowsFromGrid(grid: Cell[][]): ParsedUserRow[] {
  const rows = grid.filter(rowHasContent);
  if (rows.length === 0) return [];

  const first = rows[0].map(cellText);
  const headerEmailCol = first.findIndex((c) => /e-?mail/i.test(c) && !EMAIL_RE.test(c));
  const hasHeader = headerEmailCol !== -1;

  const emailCol = hasHeader ? headerEmailCol : 0;
  const nameCol = hasHeader ? findNameColumn(first, emailCol) : 1;
  const body = hasHeader ? rows.slice(1) : rows;

  const out: ParsedUserRow[] = [];
  for (const row of body) {
    const email = cellText(row[emailCol]);
    if (!email) continue;
    const name = nameCol === -1 ? "" : cellText(row[nameCol]);
    out.push({ email, name });
  }
  return out;
}

/** Count of rows whose email looks well-formed (drives the UI's preview). */
export function countValid(rows: ParsedUserRow[]): number {
  return rows.filter((r) => EMAIL_RE.test(r.email)).length;
}
