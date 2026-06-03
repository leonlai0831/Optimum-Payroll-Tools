// Server-only: build the Optimum Fit coaching-income report workbook (exceljs).

import ExcelJS from "exceljs";
import type { TeachingConfig, TeachingSummary } from "./types";

const NAVY = "FF1F2A56";
const WHITE = "FFFFFFFF";
const ARIAL = { name: "Arial" } as const;
const ARIAL_BOLD = { name: "Arial", bold: true } as const;
const HEADER_FONT = { name: "Arial", bold: true, color: { argb: WHITE } } as const;
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const INT = "#,##0";

function header(ws: ExcelJS.Worksheet, labels: string[]) {
  labels.forEach((h, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = h;
    c.font = HEADER_FONT;
    c.fill = HEADER_FILL;
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildTeachingWorkbook(opts: {
  monthLabel: string;
  summary: TeachingSummary;
  config: TeachingConfig;
}): Promise<Buffer> {
  const { monthLabel, summary, config } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Optimum Payroll Tools";
  wb.created = new Date();

  // ── Tab 1: per-coach income ──
  const t1 = wb.addWorksheet(`Coaching Income`);
  header(t1, ["Staff name", "PT sessions", "PT attendees", "PT income", "Group sessions", "Group income", "Total income"]);
  t1.getCell("D1").note = `PT RM${config.ptRate}/attendee · Group RM${config.groupRate}/session — ${monthLabel}`;
  t1.getColumn(1).width = 26;
  for (let c = 2; c <= 7; c++) t1.getColumn(c).width = 14;

  let r = 2;
  for (const co of summary.coaches) {
    t1.getCell(r, 1).value = co.staffName;
    t1.getCell(r, 2).value = co.ptSessions;
    t1.getCell(r, 3).value = co.ptAttendees;
    t1.getCell(r, 4).value = co.ptIncome;
    t1.getCell(r, 5).value = co.groupSessions;
    t1.getCell(r, 6).value = co.groupIncome;
    t1.getCell(r, 7).value = co.totalIncome;
    for (let c = 1; c <= 7; c++) {
      const cell = t1.getCell(r, c);
      cell.font = ARIAL;
      if (c === 4 || c === 6 || c === 7) cell.numFmt = INT;
    }
    r++;
  }
  const totalsByCol: Record<number, number> = {
    2: summary.totals.ptSessions,
    3: summary.totals.ptAttendees,
    4: summary.totals.ptIncome,
    5: summary.totals.groupSessions,
    6: summary.totals.groupIncome,
    7: summary.totals.totalIncome,
  };
  t1.getCell(r, 1).value = "TOTAL";
  t1.getCell(r, 1).font = ARIAL_BOLD;
  for (let c = 2; c <= 7; c++) {
    const cell = t1.getCell(r, c);
    cell.value = totalsByCol[c];
    cell.font = ARIAL_BOLD;
    if (c === 4 || c === 6 || c === 7) cell.numFmt = INT;
  }
  t1.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(summary.coaches.length + 1, 1), column: 7 } };

  // ── Tab 2: per-class breakdown ──
  const t2 = wb.addWorksheet("Class breakdown");
  header(t2, ["Staff name", "Class", "Type", "Sessions", "Attendees", "Income"]);
  t2.getColumn(1).width = 24;
  t2.getColumn(2).width = 30;
  t2.getColumn(3).width = 8;
  for (let c = 4; c <= 6; c++) t2.getColumn(c).width = 12;

  let rr = 2;
  for (const co of summary.coaches) {
    for (const cl of co.classes) {
      t2.getCell(rr, 1).value = co.staffName;
      t2.getCell(rr, 2).value = cl.className;
      t2.getCell(rr, 3).value = cl.kind === "pt" ? "PT" : "Group";
      t2.getCell(rr, 4).value = cl.sessions;
      t2.getCell(rr, 5).value = cl.attendees;
      t2.getCell(rr, 6).value = cl.income;
      for (let c = 1; c <= 6; c++) {
        const cell = t2.getCell(rr, c);
        cell.font = ARIAL;
        if (c === 6) cell.numFmt = INT;
      }
      rr++;
    }
  }
  t2.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(rr - 1, 1), column: 6 } };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
