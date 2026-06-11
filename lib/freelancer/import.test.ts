import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parsePaymentSummary } from "./import";

/** Build a workbook replicating the operator's real Payment Summary layout:
 * repeated entity sections, each with a title + header row, data rows and a
 * TOTAL / "Number of payees" footer — including the file's real quirks. */
async function summaryFixture(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  const header = ["No", "Month", "Position", "Name", "IC No.", "Bank", "Account No.", "Amount (RM)", "Verified By"];
  // Section 1 (OT)
  ws.addRow(["OT OPTIMUM TRAIN SDN. BHD. (824735-U)"]);
  ws.addRow(["MAY 2026 SERVICE FEE SUMMARY"]);
  ws.addRow(header);
  ws.addRow([1, "MAY", "A1", "ADRIANA GOH YING EN", "061104-10-1084", "MBBB", "162900393818", 900, "THING WAI"]);
  // bank/account swapped on the source row
  ws.addRow([2, "MAY", "A2", "NG HONG YEN", "020521-10-1746", "7639133366", "CIMB", 1398.8, "WENCHUIN"]);
  // shorthand bank codes
  ws.addRow([3, "MAY", "PA", "LEE SOON SEN", "941108-14-5637", "RHB", "11259000077536", 600, "THING WAI"]);
  ws.addRow([4, "MAY", "T0", "MUHAMMAD HAKIM BIN NOORDIN", "030226-10-0539", "MBB", "168603188132", 320, "JOSHUA"]);
  // bank outside the original list + account with leading dash
  ws.addRow([5, "MAY", "T0", "LIM YING SHI", "050817-10-1312", "BOCM", "100000403342300", 280, "TZE TIONG"]);
  ws.addRow([6, "MAY", "T3", "KHOR PUI YAN", "020603-10-0624", "HLBB", "-03600241840", 672, "TZE TIONG"]);
  // account stored with spaces
  ws.addRow([7, "MAY", "A2", "LIM HUI YING", "040607-10-1446", "PABB", "2017 2004 2011", 380, "AARON"]);
  // APRIL back-pay row still carries profile data
  ws.addRow([8, "APRIL", "I1", "ANG YONG KIAN", "000623-10-0455", "HLBB", "27000326639", 1188, "DARREN"]);
  ws.addRow(["", "", "", "", "", "", "TOTAL", 107900.2, ""]);
  ws.addRow(["", "", "", "Number of payees: 8", "", "", "", "", ""]);
  // Section 2 (OTG) — duplicates a person from section 1
  ws.addRow(["OTG OPTIMUM TRAIN GLOBAL SDN. BHD. (1312871-K)"]);
  ws.addRow(["MAY 2026 SERVICE FEE SUMMARY"]);
  ws.addRow(header);
  ws.addRow([1, "MAY", "A2", "NG HONG YEN", "020521-10-1746", "7639133366", "CIMB", 730.8, "WENCHUIN"]);
  ws.addRow([2, "MAY", "T1", "TEO JIA LE", "031107-14-1383", "OCBC", "7082475234", 432, "JOSHUA"]);
  ws.addRow(["", "", "", "", "", "", "TOTAL", 1162.8, ""]);
  ws.addRow(["", "", "", "Number of payees: 2", "", "", "", "", ""]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parsePaymentSummary (operator's monthly workbook)", () => {
  it("extracts, cleans and dedupes payees across entity sections", async () => {
    const payees = await parsePaymentSummary(await summaryFixture());
    const byName = new Map(payees.map((p) => [p.name, p]));

    // 10 data rows, NG HONG YEN in two sections → 9 unique payees;
    // titles, headers and TOTAL / payee-count footers ignored.
    expect(payees).toHaveLength(9);

    expect(byName.get("ADRIANA GOH YING EN")).toEqual({
      name: "ADRIANA GOH YING EN",
      position: "A1",
      icNo: "061104-10-1084",
      bankName: "MAYBANK",
      bankAccount: "162900393818",
    });
    // swapped bank/account corrected
    expect(byName.get("NG HONG YEN")).toMatchObject({
      bankName: "CIMB BANK",
      bankAccount: "7639133366",
    });
    // shorthand codes resolved
    expect(byName.get("LEE SOON SEN")?.bankName).toBe("RHB BANK");
    expect(byName.get("MUHAMMAD HAKIM BIN NOORDIN")?.bankName).toBe("MAYBANK");
    // Bank of China accepted
    expect(byName.get("LIM YING SHI")?.bankName).toBe("BANK OF CHINA");
    // account junk stripped
    expect(byName.get("KHOR PUI YAN")?.bankAccount).toBe("03600241840");
    expect(byName.get("LIM HUI YING")?.bankAccount).toBe("201720042011");
    // APRIL row still imported
    expect(byName.get("ANG YONG KIAN")?.position).toBe("I1");
  });
});
