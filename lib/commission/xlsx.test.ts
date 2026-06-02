import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildReportWorkbook, consolidate, parseSalesFile } from "./xlsx";
import { computeCommission } from "./calc";
import type { CommissionConfig } from "./types";

const MEMBERSHIP_HEADERS = [
  "user_name", "user_email", "user_phone", "staff_name", "staff_email", "staff_phone",
  "staff_code", "payment_transaction_id", "paid_at", "subtotal", "tax_amount",
  "total_amount", "plan_identifier_at_purchased", "plan_identifier_at_present",
];
const SUBPKG_HEADERS = [
  "user_name", "user_email", "user_phone", "staff_name", "staff_email", "staff_phone",
  "staff_code", "payment_transaction_id", "paid_at", "subtotal_amount", "tax_amount",
  "membership_redemption_amount", "total_amount", "plan_identifier_at_purchased", "plan_identifier_at_present",
];

async function makeXlsx(headers: string[], rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Tiny bands so qualifying = 3 → 6% (mirrors calc.test's hand-computed fixture).
const CONFIG: CommissionConfig = {
  bands: [
    { minCount: 2, maxCount: 3, rate: 0.06 },
    { minCount: 4, maxCount: null, rate: 0.1 },
  ],
  belowMinRate: 0,
};

/** Read a cell's numeric value, transparently unwrapping a cached formula result. */
function num(cell: ExcelJS.Cell): number {
  const v = cell.value as unknown;
  if (v && typeof v === "object" && "result" in v) return Number((v as { result: unknown }).result);
  return Number(v);
}
function findRow(ws: ExcelJS.Worksheet, label: string): number {
  let found = -1;
  ws.eachRow((row, n) => {
    if (String(row.getCell(1).value ?? "").trim() === label) found = n;
  });
  return found;
}

describe("xlsx round-trip (parse → compute → build → reload)", () => {
  it("matches the engine to the cent and writes no formula errors", async () => {
    const membership = await makeXlsx(MEMBERSHIP_HEADERS, [
      ["Alice", "", "111", "Coach A", "", "", "S1", "89001", "2026-04-01 06:24:47", 50, 4, 54, "Registration Fee", "Registration Fee"],
      ["Bob", "", "222", "Coach B", "", "", "S2", "89002", "2026-04-02 06:24:47", 50, 4, 54, "Registration Fee", "Registration Fee"],
      ["Carol", "", "333", "NULL", "NULL", "NULL", "NULL", "89003", "2026-04-03 06:24:47", 100, 8, 108, "Registration Fee", "Registration Fee"],
      ["Dave", "", "444", "Coach A", "", "", "S1", "89004", "2026-04-04 06:24:47", 0, 0, 0, "Registration Fee", "Registration Fee"],
      ["Eve", "eve@x.com", "NULL", "Coach B", "", "", "S2", "89005", "2026-04-05 06:24:47", 50, 4, 54, "Registration Fee", "Registration Fee"],
    ]);
    const subscription = await makeXlsx(SUBPKG_HEADERS, [
      ["Alice", "", "111", "Coach A", "", "", "S1", "89006", "2026-04-06 06:24:47", 200, 16, 0, 216, "1 Month Pass", "1 Month Pass"],
      ["Bob", "", "222", "Coach B", "", "", "S2", "89007", "2026-04-07 06:24:47", 300, 24, 0, 324, "3 Months Pass", "3 Months Pass"],
      ["Eve", "eve@x.com", "NULL", "Coach B", "", "", "S2", "89008", "2026-04-08 06:24:47", 100, 8, 0, 108, "1 Month Pass", "1 Month Pass"],
    ]);
    const packages = await makeXlsx(SUBPKG_HEADERS, [
      ["Alice", "", "111", "Coach A", "", "", "S1", "89009", "2026-04-09 06:24:47", 500, 40, 0, 540, "10 Sessions Pack", "10 Sessions Pack"],
    ]);

    const [m, s, p] = await Promise.all([
      parseSalesFile(membership, "Membership"),
      parseSalesFile(subscription, "Subscription"),
      parseSalesFile(packages, "Package"),
    ]);

    // Combined row count == sum of the 3 sources (spec verify step).
    const rows = consolidate([m, s, p]);
    expect(rows.length).toBe(m.length + s.length + p.length);
    expect(rows.length).toBe(9);

    // "NULL" became blank; membership has null redemption; phone kept as exact digits.
    expect(rows.find((r) => r.user_name === "Carol")!.staff_code).toBe("");
    expect(m[0].membership_redemption_amount).toBeNull();
    expect(rows.find((r) => r.user_name === "Alice")!.user_phone).toBe("111");

    const summary = computeCommission(rows, CONFIG);
    const buf = await buildReportWorkbook({ monthLabel: "April 2026", rows, summary, config: CONFIG });

    // Reload and assert the cached results match the engine.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const t1 = wb.worksheets[0];
    const t2 = wb.getWorksheet("Commission Summary")!;

    expect(t1.rowCount - 1).toBe(9); // minus header

    expect(num(t2.getCell("B6"))).toBe(summary.registrations.qualifying); // qualifying
    expect(num(t2.getCell("B7"))).toBeCloseTo(0.06, 6); // rate

    const totalRow = findRow(t2, "TOTAL");
    expect(num(t2.getCell(totalRow, 8))).toBeCloseTo(summary.totals.commission, 2); // 75.00
    expect(num(t2.getCell(totalRow, 7))).toBeCloseTo(summary.totals.totalBase, 2); // 1250.00

    const allSalesRow = findRow(t2, "All sales pre-SST (incl. unattributed)");
    expect(num(t2.getCell(allSalesRow, 7))).toBeCloseTo(summary.allSalesPreSst, 2); // 1350.00

    // No formula errors anywhere.
    const errors: string[] = [];
    for (const ws of wb.worksheets) {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const v = cell.value as unknown;
          if (v && typeof v === "object") {
            const o = v as { error?: string; result?: { error?: string } };
            if (o.error) errors.push(o.error);
            if (o.result && typeof o.result === "object" && o.result.error) errors.push(o.result.error);
          }
        });
      });
    }
    expect(errors).toEqual([]);
  });
});
