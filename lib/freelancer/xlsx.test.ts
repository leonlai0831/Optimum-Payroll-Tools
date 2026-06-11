import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildFreelancerBankWorkbook, freelancerFileName, type FreelancerExportRun } from "./xlsx";
import { calcFreelancer } from "./calc";
import { DEFAULT_FREELANCER_CONFIG } from "./defaults";
import type { FreelancerInput } from "./types";

const cfg = DEFAULT_FREELANCER_CONFIG;

function run(name: string, input: Omit<FreelancerInput, "coachId" | "name">): FreelancerExportRun {
  const full: FreelancerInput = { coachId: null, name, ...input };
  return { canonicalName: name, input: full, result: calcFreelancer(full, cfg) };
}

describe("freelancer bank-transfer workbook", () => {
  it("names the file after the period", () => {
    expect(freelancerFileName("2026-06")).toBe("Freelancer-Payments-2026-06.xlsx");
  });

  it("writes one sheet per paying entity with a payout, with payee rows + TOTAL", async () => {
    const runs: FreelancerExportRun[] = [
      run("FIONA", {
        position: "T1",
        icNo: "900101-14-5678",
        bankName: "MAYBANK",
        bankAccount: "1122334455",
        centerRows: [
          { center: "HQ", replacedHours: 10, fixedHours: 25, absent: false },
          { center: "PK", replacedHours: 0, fixedHours: 10, absent: false },
        ],
        blackCount: 2,
        colourCount: 20,
        extras: [],
      }),
      run("=GARY", {
        // leading "=" exercises the formula-injection neutralizer
        position: "A1",
        icNo: "880202-10-1234",
        bankName: "CIMB BANK",
        bankAccount: "999888777",
        centerRows: [{ center: "PJ", replacedHours: 0, fixedHours: 10, absent: true }],
        blackCount: 0,
        colourCount: 0,
        extras: [{ entity: "KM", reason: "Event", amount: 55.5 }],
      }),
    ];

    const buf = await buildFreelancerBankWorkbook({ period: "2026-06", runs });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);

    // FIONA pays from OT (HQ+PK); GARY from PJ (hours) and KM (extra). No OTG/QSM sheets.
    expect(wb.worksheets.map((w) => w.name).sort()).toEqual(["KM", "OT", "PJ"]);

    const ot = wb.getWorksheet("OT")!;
    expect(String(ot.getCell(1, 1).value)).toContain("OT — Freelancer Payments 2026-06");
    expect(ot.getCell(2, 1).value).toBe("No");
    expect(ot.getCell(3, 2).value).toBe("FIONA");
    expect(ot.getCell(3, 3).value).toBe("900101-14-5678");
    expect(ot.getCell(3, 4).value).toBe("MAYBANK");
    expect(ot.getCell(3, 5).value).toBe("MBBB");
    expect(ot.getCell(3, 6).value).toBe("1122334455");
    expect(ot.getCell(3, 7).value).toBe(1004); // worked example: 752 + 252
    expect(ot.getCell(4, 2).value).toBe("TOTAL");
    expect((ot.getCell(4, 7).value as ExcelJS.CellFormulaValue).result).toBe(1004);

    const pj = wb.getWorksheet("PJ")!;
    // Name is user-derived text → "=GARY" must be neutralized to "'=GARY".
    expect(pj.getCell(3, 2).value).toBe("'=GARY");
    expect(pj.getCell(3, 5).value).toBe("CIMB");
    expect(pj.getCell(3, 7).value).toBe(130); // A1 PJ 13/h × 10h, absent → no bonus

    const km = wb.getWorksheet("KM")!;
    expect(km.getCell(3, 7).value).toBe(55.5);
  });

  it("yields an informative workbook for a month with no payouts", async () => {
    const buf = await buildFreelancerBankWorkbook({ period: "2026-07", runs: [] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    expect(wb.worksheets.length).toBe(1);
    expect(String(wb.worksheets[0].getCell(1, 1).value)).toContain("2026-07");
  });
});
