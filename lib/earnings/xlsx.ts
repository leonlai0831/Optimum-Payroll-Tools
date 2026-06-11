// Server-only: build one staff member's earnings workbook — a row per saved
// month (commission + coaching income), with a TOTAL row (exceljs).

import ExcelJS from "exceljs";
import { sanitizeSpreadsheetText } from "@/lib/utils";
import type { StaffEarningsReport } from "./income";

const NAVY = "FF1F2A56";
const WHITE = "FFFFFFFF";
const ARIAL = { name: "Arial" } as const;
const ARIAL_BOLD = { name: "Arial", bold: true } as const;
const HEADER_FONT = { name: "Arial", bold: true, color: { argb: WHITE } } as const;
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const INT = "#,##0";

export async function buildStaffEarningsWorkbook(opts: {
  staffName: string;
  staffCode: string;
  report: StaffEarningsReport;
}): Promise<Buffer> {
  const { staffName, staffCode, report } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Optimum People Hub";
  wb.created = new Date();

  const ws = wb.addWorksheet("Earnings", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = ["Month", "Commission", "Coaching income", "Total income"];
  headers.forEach((h, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = h;
    c.font = HEADER_FONT;
    c.fill = HEADER_FILL;
  });
  ws.getCell("A1").note = `Optimum Fit — ${staffName}${staffCode ? ` (${staffCode})` : ""}`;
  ws.getColumn(1).width = 22;
  for (let c = 2; c <= 4; c++) ws.getColumn(c).width = 16;

  let r = 2;
  for (const m of report.months) {
    ws.getCell(r, 1).value = sanitizeSpreadsheetText(m.period);
    ws.getCell(r, 2).value = m.commission;
    ws.getCell(r, 3).value = m.coachingIncome;
    ws.getCell(r, 4).value = m.total;
    for (let c = 1; c <= 4; c++) {
      const cell = ws.getCell(r, c);
      cell.font = ARIAL;
      if (c >= 2) cell.numFmt = INT;
    }
    r++;
  }

  ws.getCell(r, 1).value = "TOTAL";
  ws.getCell(r, 1).font = ARIAL_BOLD;
  ws.getCell(r, 2).value = report.totals.commission;
  ws.getCell(r, 3).value = report.totals.coachingIncome;
  ws.getCell(r, 4).value = report.totals.total;
  for (let c = 2; c <= 4; c++) {
    ws.getCell(r, c).font = ARIAL_BOLD;
    ws.getCell(r, c).numFmt = INT;
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(report.months.length + 1, 1), column: 4 } };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
