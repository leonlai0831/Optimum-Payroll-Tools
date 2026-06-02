// Server-only Excel I/O for the Optimum Fit commission report. Imports exceljs,
// so this must never be pulled into a client bundle — only route handlers use it.

import ExcelJS from "exceljs";
import type { CommissionConfig, CommissionRow, CommissionSummary, SalesType } from "./types";

const NAVY = "FF1F2A56";
const WHITE = "FFFFFFFF";
const ARIAL = { name: "Arial" } as const;
const ARIAL_BOLD = { name: "Arial", bold: true } as const;
const HEADER_FONT = { name: "Arial", bold: true, color: { argb: WHITE } } as const;
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const MONEY = "#,##0.00";
const INT = "#,##0"; // commission is whole ringgit (rounded up)

/** Unified Tab-1 columns, in order. `id` columns render as TEXT (exact digits). */
const TAB1_COLUMNS: { key: keyof CommissionRow; header: string; kind: "text" | "num" | "id"; width: number }[] = [
  { key: "sales_type", header: "sales_type", kind: "text", width: 13 },
  { key: "user_name", header: "user_name", kind: "text", width: 22 },
  { key: "user_email", header: "user_email", kind: "text", width: 26 },
  { key: "user_phone", header: "user_phone", kind: "id", width: 16 },
  { key: "staff_name", header: "staff_name", kind: "text", width: 22 },
  { key: "staff_email", header: "staff_email", kind: "text", width: 26 },
  { key: "staff_phone", header: "staff_phone", kind: "id", width: 16 },
  { key: "staff_code", header: "staff_code", kind: "text", width: 12 },
  { key: "payment_transaction_id", header: "payment_transaction_id", kind: "id", width: 16 },
  { key: "paid_at", header: "paid_at", kind: "text", width: 20 },
  { key: "subtotal_amount", header: "subtotal_amount", kind: "num", width: 14 },
  { key: "tax_amount", header: "tax_amount", kind: "num", width: 12 },
  { key: "membership_redemption_amount", header: "membership_redemption_amount", kind: "num", width: 16 },
  { key: "total_amount", header: "total_amount", kind: "num", width: 13 },
  { key: "plan_identifier_at_purchased", header: "plan_identifier_at_purchased", kind: "text", width: 28 },
  { key: "plan_identifier_at_present", header: "plan_identifier_at_present", kind: "text", width: 28 },
];

// ── parsing ───────────────────────────────────────────────────────────────────

/** Header alias → unified field. The membership file uses `subtotal`; others `subtotal_amount`. */
const HEADER_ALIASES: Record<string, keyof CommissionRow> = {
  sales_type: "sales_type",
  user_name: "user_name",
  user_email: "user_email",
  user_phone: "user_phone",
  staff_name: "staff_name",
  staff_email: "staff_email",
  staff_phone: "staff_phone",
  staff_code: "staff_code",
  payment_transaction_id: "payment_transaction_id",
  paid_at: "paid_at",
  subtotal: "subtotal_amount",
  subtotal_amount: "subtotal_amount",
  tax_amount: "tax_amount",
  membership_redemption_amount: "membership_redemption_amount",
  total_amount: "total_amount",
  plan_identifier_at_purchased: "plan_identifier_at_purchased",
  plan_identifier_at_present: "plan_identifier_at_present",
};

function isNullish(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" || t.toUpperCase() === "NULL";
  }
  return false;
}

/** Normalise any exceljs cell value to a trimmed string ("" for NULL/blank). */
function asText(v: ExcelJS.CellValue): string {
  if (isNullish(v)) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return formatDateTime(v);
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.trim();
    if (Array.isArray(o.richText)) return o.richText.map((t) => (t as { text: string }).text).join("").trim();
    if ("result" in o) return asText(o.result as ExcelJS.CellValue);
  }
  return "";
}

/** Exact digit string for phones / transaction ids (never scientific notation). */
function asDigits(v: ExcelJS.CellValue): string {
  if (isNullish(v)) return "";
  if (typeof v === "number") return Math.trunc(v).toString();
  let s = asText(v).replace(/[,\s]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot);
  return s.replace(/\D/g, "");
}

function asNumber(v: ExcelJS.CellValue): number {
  if (isNullish(v)) return 0;
  if (typeof v === "number") return v;
  if (v instanceof Date) return 0;
  const n = parseFloat(asText(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function fromParts(y: number, mo: number, d: number, h: number, mi: number, se: number): string {
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(se)}`;
}

/** Normalise a date/datetime to "yyyy-mm-dd hh:mm:ss" (so lexical sort == chronological). */
function formatDateTime(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) {
    return fromParts(
      v.getUTCFullYear(),
      v.getUTCMonth() + 1,
      v.getUTCDate(),
      v.getUTCHours(),
      v.getUTCMinutes(),
      v.getUTCSeconds(),
    );
  }
  const s = typeof v === "string" ? v.trim() : asText(v);
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return fromParts(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (m) {
    let h = +m[4];
    const ap = m[7]?.toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return fromParts(+m[3], +m[1], +m[2], h, +m[5], m[6] ? +m[6] : 0);
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return fromParts(+m[1], +m[2], +m[3], 0, 0, 0);
  return s;
}

/** Parse one uploaded .xlsx into unified rows, tagging every row with `salesType`. */
export async function parseSalesFile(
  buffer: ArrayBuffer | Buffer,
  salesType: SalesType,
): Promise<CommissionRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const colOf = new Map<keyof CommissionRow, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const norm = asText(cell.value).toLowerCase().replace(/\s+/g, "_");
    const key = HEADER_ALIASES[norm];
    if (key && !colOf.has(key)) colOf.set(key, col);
  });

  const cell = (row: ExcelJS.Row, key: keyof CommissionRow): ExcelJS.CellValue => {
    const c = colOf.get(key);
    return c ? row.getCell(c).value : null;
  };

  const rows: CommissionRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const txid = asDigits(cell(row, "payment_transaction_id"));
    const userName = asText(cell(row, "user_name"));
    const subtotal = asNumber(cell(row, "subtotal_amount"));
    const total = asNumber(cell(row, "total_amount"));
    if (!txid && !userName && !subtotal && !total) return; // skip blank lines

    rows.push({
      sales_type: salesType,
      user_name: userName,
      user_email: asText(cell(row, "user_email")),
      user_phone: asDigits(cell(row, "user_phone")),
      staff_name: asText(cell(row, "staff_name")),
      staff_email: asText(cell(row, "staff_email")),
      staff_phone: asDigits(cell(row, "staff_phone")),
      staff_code: asText(cell(row, "staff_code")),
      payment_transaction_id: txid,
      paid_at: formatDateTime(cell(row, "paid_at")),
      subtotal_amount: subtotal,
      tax_amount: asNumber(cell(row, "tax_amount")),
      membership_redemption_amount:
        salesType === "Membership" ? null : asNumber(cell(row, "membership_redemption_amount")),
      total_amount: total,
      plan_identifier_at_purchased: asText(cell(row, "plan_identifier_at_purchased")),
      plan_identifier_at_present: asText(cell(row, "plan_identifier_at_present")),
    });
  });
  return rows;
}

/** Stack the 3 parsed file row-sets and sort chronologically by paid_at ascending. */
export function consolidate(parts: CommissionRow[][]): CommissionRow[] {
  const all = parts.flat();
  all.sort((a, b) => a.paid_at.localeCompare(b.paid_at));
  return all;
}

// ── workbook generation ───────────────────────────────────────────────────────

function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/** Nested-IF rate band formula off the qualifying-count cell (reflects config bands). */
function rateBandFormula(qCell: string, config: CommissionConfig): string {
  const bands = [...config.bands].sort((a, b) => a.minCount - b.minCount);
  if (bands.length === 0) return String(config.belowMinRate);
  const lowest = bands[0].minCount;
  let expr = String(bands[bands.length - 1].rate); // innermost else = top band's rate
  for (let i = bands.length - 2; i >= 0; i--) {
    expr = `IF(${qCell}<=${bands[i].maxCount},${bands[i].rate},${expr})`;
  }
  return `IF(${qCell}<${lowest},${config.belowMinRate},${expr})`;
}

/** Build the 2-tab workbook (consolidated data + commission summary with live formulas). */
export async function buildReportWorkbook(opts: {
  monthLabel: string;
  rows: CommissionRow[];
  summary: CommissionSummary;
  config: CommissionConfig;
}): Promise<Buffer> {
  const { monthLabel, rows, summary, config } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Optimum Payroll Tools";
  wb.created = new Date();

  // ── Tab 1: consolidated "All Sales" ──
  const sheetName = `${monthLabel} All Sales`.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
  const t1 = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });

  TAB1_COLUMNS.forEach((c, i) => {
    const cell = t1.getCell(1, i + 1);
    cell.value = c.header;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle" };
    t1.getColumn(i + 1).width = c.width;
  });

  rows.forEach((row, ri) => {
    const excelRow = t1.getRow(ri + 2);
    TAB1_COLUMNS.forEach((c, i) => {
      const cell = excelRow.getCell(i + 1);
      const v = row[c.key];
      if (c.kind === "num") {
        if (v !== null && v !== undefined && v !== "") {
          cell.value = Number(v);
          cell.numFmt = MONEY;
        }
      } else if (c.kind === "id") {
        const s = String(v ?? "");
        if (s) {
          cell.value = s;
          cell.numFmt = "@"; // force TEXT so big ids never go scientific
        }
      } else {
        const s = String(v ?? "");
        if (s) cell.value = s;
      }
      cell.font = ARIAL;
    });
  });

  const lastData = rows.length + 1; // last Tab-1 data row index
  t1.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(lastData, 1), column: TAB1_COLUMNS.length },
  };

  // ── Tab 2: Commission Summary (live COUNTIF / SUMIFS into Tab 1) ──
  const t2 = wb.addWorksheet("Commission Summary");
  const ref = `'${sheetName}'`;
  const range = (L: string) => `${ref}!$${L}$2:$${L}$${lastData}`;

  t2.mergeCells("A1:H1");
  const title = t2.getCell("A1");
  title.value = `Commission Summary — ${monthLabel}`;
  title.font = { name: "Arial", bold: true, size: 14 };

  // Rate-determination block (A3:B7)
  t2.getCell("A3").value = "Rate determination";
  t2.getCell("A3").font = ARIAL_BOLD;
  t2.getCell("A4").value = "Total registrations";
  t2.getCell("B4").value = { formula: `COUNTIF(${range("A")},"Membership")`, result: summary.registrations.total };
  t2.getCell("A5").value = "Registration-only (excluded)";
  const exCell = t2.getCell("B5");
  exCell.value = summary.registrations.excluded.length;
  if (summary.registrations.excluded.length > 0) {
    exCell.note = `Excluded from the rate count (registered but never subscribed):\n${summary.registrations.excluded.join(", ")}`;
  }
  t2.getCell("A6").value = "Qualifying registrations";
  t2.getCell("B6").value = { formula: "B4-B5", result: summary.registrations.qualifying };
  t2.getCell("A7").value = "Commission rate";
  const rateCell = t2.getCell("B7");
  rateCell.value = { formula: rateBandFormula("B6", config), result: summary.rate };
  rateCell.numFmt = "0%";
  for (const a of ["A3", "A4", "A5", "A6", "A7"]) t2.getCell(a).font = a === "A3" ? ARIAL_BOLD : ARIAL;
  for (const a of ["B4", "B5", "B6", "B7"]) t2.getCell(a).font = ARIAL;
  if (summary.belowMin) {
    t2.getCell("A8").value = "⚠ Qualifying below minimum band — rate applied is 0%.";
    t2.getCell("A8").font = { name: "Arial", italic: true, color: { argb: "FFB45309" } };
  }

  // Rate-band legend (D3 down)
  const bands = [...config.bands].sort((a, b) => a.minCount - b.minCount);
  t2.getCell("D3").value = "Rate band (qualifying)";
  t2.getCell("E3").value = "Rate";
  t2.getCell("D3").font = ARIAL_BOLD;
  t2.getCell("E3").font = ARIAL_BOLD;
  let lr = 4;
  t2.getCell(`D${lr}`).value = `< ${bands[0]?.minCount ?? 0}`;
  t2.getCell(`E${lr}`).value = config.belowMinRate;
  t2.getCell(`E${lr}`).numFmt = "0%";
  lr++;
  for (const b of bands) {
    t2.getCell(`D${lr}`).value = b.maxCount == null ? `${b.minCount}+` : `${b.minCount}–${b.maxCount}`;
    t2.getCell(`E${lr}`).value = b.rate;
    t2.getCell(`E${lr}`).numFmt = "0%";
    lr++;
  }
  t2.getColumn(1).width = 38;
  t2.getColumn(2).width = 18;
  for (let c = 3; c <= 8; c++) t2.getColumn(c).width = 16;

  // Per-staff table
  const headers = [
    "Staff code",
    "Staff name",
    "# Txns",
    "Subscription base",
    "Package base",
    "Registration base",
    "Total base",
    "Commission",
  ];
  let r = Math.max(8, lr) + 1;
  headers.forEach((h, i) => {
    const cell = t2.getCell(r, i + 1);
    cell.value = h;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
  });
  r++;
  const firstStaffRow = r;
  for (const s of summary.staff) {
    t2.getCell(r, 1).value = s.staffCode;
    t2.getCell(r, 2).value = s.staffName;
    t2.getCell(r, 3).value = { formula: `COUNTIF(${range("H")},$A${r})`, result: s.transactions };
    t2.getCell(r, 4).value = {
      formula: `SUMIFS(${range("K")},${range("H")},$A${r},${range("A")},"Subscription")`,
      result: s.subscriptionBase,
    };
    t2.getCell(r, 5).value = {
      formula: `SUMIFS(${range("K")},${range("H")},$A${r},${range("A")},"Package")`,
      result: s.packageBase,
    };
    t2.getCell(r, 6).value = {
      formula: `SUMIFS(${range("K")},${range("H")},$A${r},${range("A")},"Membership")`,
      result: s.registrationBase,
    };
    t2.getCell(r, 7).value = { formula: `SUMIFS(${range("K")},${range("H")},$A${r})`, result: s.totalBase };
    t2.getCell(r, 8).value = { formula: `ROUNDUP(G${r}*$B$7,0)`, result: s.commission };
    for (let c = 1; c <= 8; c++) {
      const cell = t2.getCell(r, c);
      cell.font = ARIAL;
      if (c >= 4 && c <= 7) cell.numFmt = MONEY;
      if (c === 8) cell.numFmt = INT;
    }
    r++;
  }
  const lastStaffRow = r - 1;

  // TOTAL row
  t2.getCell(r, 1).value = "TOTAL";
  t2.getCell(r, 1).font = ARIAL_BOLD;
  const totalsByCol: Record<number, number> = {
    3: summary.totals.transactions,
    4: summary.totals.subscriptionBase,
    5: summary.totals.packageBase,
    6: summary.totals.registrationBase,
    7: summary.totals.totalBase,
    8: summary.totals.commission,
  };
  for (let c = 3; c <= 8; c++) {
    const L = colLetter(c);
    const cell = t2.getCell(r, c);
    cell.value =
      lastStaffRow >= firstStaffRow
        ? { formula: `SUM(${L}${firstStaffRow}:${L}${lastStaffRow})`, result: totalsByCol[c] }
        : 0;
    cell.font = ARIAL_BOLD;
    if (c >= 4 && c <= 7) cell.numFmt = MONEY;
    if (c === 8) cell.numFmt = INT;
  }
  r += 2;

  // Reference rows
  t2.getCell(r, 1).value = "All sales pre-SST (incl. unattributed)";
  t2.getCell(r, 1).font = ARIAL;
  t2.getCell(r, 7).value = { formula: `SUM(${range("K")})`, result: summary.allSalesPreSst };
  t2.getCell(r, 7).numFmt = MONEY;
  t2.getCell(r, 7).font = ARIAL;
  r++;
  t2.getCell(r, 1).value = "Unattributed (no staff_code) — not commissionable";
  t2.getCell(r, 1).font = ARIAL;
  t2.getCell(r, 7).value = { formula: `SUMIFS(${range("K")},${range("H")},"")`, result: summary.unattributedBase };
  t2.getCell(r, 7).numFmt = MONEY;
  t2.getCell(r, 7).font = ARIAL;

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
