import ExcelJS from "exceljs";
import { MALAYSIAN_BANKS } from "./banks";
import { FREELANCER_POSITIONS, type FreelancerPosition } from "./types";

/**
 * Parser for the operator's monthly "Payment Summary" workbook (one sheet,
 * one section per paying entity, each with a `No / Month / Position / Name /
 * IC No. / Bank / Account No. / Amount / Verified By` header). Extracts every
 * payee's profile fields for the Workforce import — deduplicated by name
 * (a person paid by several entities appears once, first occurrence wins).
 *
 * Cleans the file's real-world quirks: bank/account columns swapped on some
 * rows, bank-code shorthand (MBB → MBBB, RHB → RHBB, ABMB → ALBB), accounts
 * with spaces or stray leading dashes, thousands separators.
 */

export interface ImportedPayee {
  name: string;
  position: FreelancerPosition | null;
  icNo: string;
  bankName: string; // canonical bank NAME from MALAYSIAN_BANKS ("" if unknown)
  bankAccount: string;
}

/** The operator's shorthand → the canonical codes in MALAYSIAN_BANKS. */
const CODE_ALIASES: Record<string, string> = {
  MBB: "MBBB",
  RHB: "RHBB",
  ABMB: "ALBB",
};

const byCode = new Map(MALAYSIAN_BANKS.map((b) => [b.code, b.name]));
const byName = new Map(MALAYSIAN_BANKS.map((b) => [b.name.toUpperCase(), b.name]));

/** Resolve a raw bank cell (code, alias or full name) to a canonical name. */
function bankNameFor(raw: string): string {
  const v = raw.trim().toUpperCase();
  if (!v) return "";
  return byCode.get(CODE_ALIASES[v] ?? v) ?? byName.get(v) ?? "";
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && "result" in v) return cellText(v.result as ExcelJS.CellValue);
  return String(v);
};

/** Strip account junk: spaces, thousands separators, stray leading dashes. */
const cleanAccount = (raw: string): string => raw.replace(/[\s,]/g, "").replace(/^-+/, "");

export async function parsePaymentSummary(buffer: Buffer): Promise<ImportedPayee[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const out = new Map<string, ImportedPayee>();

  for (const ws of wb.worksheets) {
    // Find each section's header to learn the column layout (sections repeat).
    let cols: Record<string, number> | null = null;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const texts = new Map<number, string>();
      row.eachCell({ includeEmpty: false }, (cell, col) => texts.set(col, cellText(cell.value).trim()));
      const lower = new Map([...texts].map(([c, t]) => [t.toLowerCase(), c]));
      if (lower.has("name") && lower.has("position")) {
        cols = {
          position: lower.get("position")!,
          name: lower.get("name")!,
          ic: lower.get("ic no.") ?? lower.get("ic no") ?? lower.get("ic")!,
          bank: lower.get("bank")!,
          account: lower.get("account no.") ?? lower.get("account no") ?? lower.get("account")!,
        };
        return;
      }
      if (!cols) return;
      const name = (texts.get(cols.name) ?? "").trim().toUpperCase();
      // Data rows carry a payee name + an IC/bank pair; TOTAL/footer rows don't.
      if (!name || name.startsWith("NUMBER OF PAYEES") || name === "TOTAL") return;
      const icRaw = (texts.get(cols.ic) ?? "").trim();
      let bankRaw = (texts.get(cols.bank) ?? "").trim();
      let accountRaw = (texts.get(cols.account) ?? "").trim();
      if (!icRaw && !bankRaw && !accountRaw) return;
      // Some rows have bank and account swapped (account digits in the bank
      // column). If the "account" cell resolves to a bank and the "bank" cell
      // doesn't, swap them back.
      if (!bankNameFor(bankRaw) && bankNameFor(accountRaw)) {
        [bankRaw, accountRaw] = [accountRaw, bankRaw];
      }
      const positionRaw = (texts.get(cols.position) ?? "").trim().toUpperCase();
      const position = (FREELANCER_POSITIONS as readonly string[]).includes(positionRaw)
        ? (positionRaw as FreelancerPosition)
        : null;
      if (!out.has(name)) {
        out.set(name, {
          name,
          position,
          icNo: icRaw,
          bankName: bankNameFor(bankRaw),
          bankAccount: cleanAccount(accountRaw),
        });
      }
    });
  }
  return [...out.values()];
}
