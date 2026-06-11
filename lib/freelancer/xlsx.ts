// Server-only Excel output for the freelancer bank-transfer file. Imports
// exceljs, so this must never be pulled into a client bundle — only the export
// route handler uses it (mirrors lib/commission/xlsx.ts).

import ExcelJS from "exceljs";
import { sanitizeSpreadsheetText } from "@/lib/utils";
import { bankCode } from "./banks";
import type { FreelancerInput, FreelancerResult } from "./types";

const NAVY = "FF1F2A56";
const WHITE = "FFFFFFFF";
const ARIAL = { name: "Arial" } as const;
const ARIAL_BOLD = { name: "Arial", bold: true } as const;
const HEADER_FONT = { name: "Arial", bold: true, color: { argb: WHITE } } as const;
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const MONEY = "#,##0.00";

const COLUMNS = [
  { header: "No", width: 5 },
  { header: "Month", width: 10 },
  { header: "Name", width: 28 },
  { header: "IC No", width: 18 },
  { header: "Bank", width: 26 },
  { header: "Bank Code", width: 11 },
  { header: "Account No", width: 18 },
  { header: "Amount (RM)", width: 13 },
] as const;

const MONTH_NAMES = [
  "JAN", "FEB", "MAR", "APRIL", "MAY", "JUNE",
  "JULY", "AUG", "SEPT", "OCT", "NOV", "DEC",
] as const;

/** "2026-04" → "APRIL"; the year only shows for cross-year late submissions ("DEC 2025"). */
function monthLabel(workPeriod: string, payoutPeriod: string): string {
  const [y, m] = workPeriod.split("-").map(Number);
  const name = MONTH_NAMES[(m ?? 1) - 1] ?? workPeriod;
  return String(y) === payoutPeriod.slice(0, 4) ? name : `${name} ${y}`;
}

/** The slice of a saved run the workbook needs (a subset of FreelancerRunRecord). */
export interface FreelancerExportRun {
  canonicalName: string;
  input: FreelancerInput;
  result: FreelancerResult;
}

export function freelancerFileName(period: string): string {
  return `Freelancer-Payments-${period}.xlsx`;
}

/**
 * Build the bank-transfer workbook for one month: one worksheet PER paying
 * entity that has any payout, each listing who that company pays (payee bank
 * details + amount) with a TOTAL row.
 */
export async function buildFreelancerBankWorkbook(opts: {
  period: string;
  runs: FreelancerExportRun[];
}): Promise<Buffer> {
  const { period, runs } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Optimum People Hub";
  wb.created = new Date();

  // Entity order/labels come from the saved results (config snapshot order).
  const entities: { entity: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const run of runs) {
    for (const e of run.result.entityTotals) {
      if (seen.has(e.entity)) continue;
      seen.add(e.entity);
      entities.push({ entity: e.entity, label: e.label });
    }
  }

  for (const { entity, label } of entities) {
    // One transfer row per (person, work month): a person's several position-
    // family records merge into one amount; a late submission for an earlier
    // month keeps its own row, distinguished by the Month column — exactly
    // like the operator's summary.
    const byPayee = new Map<string, { run: FreelancerExportRun; work: string; amount: number }>();
    for (const run of runs) {
      const amount = run.result.entityTotals.find((e) => e.entity === entity)?.amount ?? 0;
      if (amount <= 0) continue;
      const work = run.input.workPeriod || period;
      const key = `${run.canonicalName}::${work}`;
      const cur = byPayee.get(key);
      if (cur) cur.amount += amount;
      else byPayee.set(key, { run, work, amount });
    }
    const payees = [...byPayee.values()].sort(
      (a, b) => a.run.canonicalName.localeCompare(b.run.canonicalName) || a.work.localeCompare(b.work),
    );
    if (payees.length === 0) continue; // only entities with a payout this month

    const sheetName = `${label}`.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || entity;
    const ws = wb.addWorksheet(sheetName);

    // Title row: entity label + period.
    ws.mergeCells(1, 1, 1, COLUMNS.length);
    const title = ws.getCell(1, 1);
    title.value = `${label} — Freelancer Payments ${period}`;
    title.font = { name: "Arial", bold: true, size: 13 };

    COLUMNS.forEach((c, i) => {
      const cell = ws.getCell(2, i + 1);
      cell.value = c.header;
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = { vertical: "middle" };
      ws.getColumn(i + 1).width = c.width;
    });

    payees.forEach(({ run, work, amount }, i) => {
      const r = i + 3;
      ws.getCell(r, 1).value = i + 1;
      ws.getCell(r, 2).value = monthLabel(work, period);
      // User-derived text gets formula-injection neutralized.
      ws.getCell(r, 3).value = sanitizeSpreadsheetText(run.canonicalName);
      ws.getCell(r, 4).value = sanitizeSpreadsheetText(run.input.icNo ?? "");
      ws.getCell(r, 4).numFmt = "@"; // keep IC digits as TEXT
      ws.getCell(r, 5).value = sanitizeSpreadsheetText(run.input.bankName ?? "");
      ws.getCell(r, 6).value = bankCode(run.input.bankName ?? "");
      ws.getCell(r, 7).value = sanitizeSpreadsheetText(run.input.bankAccount ?? "");
      ws.getCell(r, 7).numFmt = "@"; // account numbers must never go scientific
      ws.getCell(r, 8).value = amount;
      ws.getCell(r, 8).numFmt = MONEY;
      for (let c = 1; c <= COLUMNS.length; c++) ws.getCell(r, c).font = ARIAL;
    });

    // TOTAL row.
    const totalRow = payees.length + 3;
    ws.getCell(totalRow, 3).value = "TOTAL";
    ws.getCell(totalRow, 3).font = ARIAL_BOLD;
    const totalCell = ws.getCell(totalRow, 8);
    totalCell.value = {
      formula: `SUM(H3:H${totalRow - 1})`,
      result: payees.reduce((s, p) => s + p.amount, 0),
    };
    totalCell.numFmt = MONEY;
    totalCell.font = ARIAL_BOLD;
  }

  // A month with no payouts still yields a valid (informative) workbook.
  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet("No payouts");
    ws.getCell(1, 1).value = `No freelancer payouts saved for ${period}.`;
    ws.getCell(1, 1).font = ARIAL;
    ws.getColumn(1).width = 50;
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
