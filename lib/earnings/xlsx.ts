// Server-only: build the per-staff income report workbook (exceljs).

import ExcelJS from "exceljs";
import type { IncomeReport } from "./income";

const NAVY = "FF1F2A56";
const WHITE = "FFFFFFFF";
const ARIAL = { name: "Arial" } as const;
const ARIAL_BOLD = { name: "Arial", bold: true } as const;
const HEADER_FONT = { name: "Arial", bold: true, color: { argb: WHITE } } as const;
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const INT = "#,##0";

export async function buildIncomeWorkbook(opts: {
  monthLabel: string;
  report: IncomeReport;
}): Promise<Buffer> {
  const { monthLabel, report } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Optimum Payroll Tools";
  wb.created = new Date();

  const ws = wb.addWorksheet(`Staff Earnings`, { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = ["Staff name", "Staff code", "Commission", "Coaching income", "Total income"];
  headers.forEach((h, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = h;
    c.font = HEADER_FONT;
    c.fill = HEADER_FILL;
  });
  ws.getCell("A1").note = `Optimum Fit — ${monthLabel}`;
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 14;
  for (let c = 3; c <= 5; c++) ws.getColumn(c).width = 16;

  let r = 2;
  for (const row of report.rows) {
    ws.getCell(r, 1).value = row.name;
    ws.getCell(r, 2).value = row.staffCode;
    ws.getCell(r, 3).value = row.commission;
    ws.getCell(r, 4).value = row.coachingIncome;
    ws.getCell(r, 5).value = row.total;
    for (let c = 1; c <= 5; c++) {
      const cell = ws.getCell(r, c);
      cell.font = ARIAL;
      if (c >= 3) cell.numFmt = INT;
    }
    r++;
  }

  ws.getCell(r, 1).value = "TOTAL";
  ws.getCell(r, 1).font = ARIAL_BOLD;
  ws.getCell(r, 3).value = report.totals.commission;
  ws.getCell(r, 4).value = report.totals.coachingIncome;
  ws.getCell(r, 5).value = report.totals.total;
  for (let c = 3; c <= 5; c++) {
    ws.getCell(r, c).font = ARIAL_BOLD;
    ws.getCell(r, c).numFmt = INT;
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(report.rows.length + 1, 1), column: 5 } };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
