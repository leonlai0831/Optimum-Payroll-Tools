// Server-only: parse the monthly class_session_attendees export (CSV or .xlsx)
// into unified TeachingRow[]. Imports exceljs/papaparse — never bundle on client.

import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { TeachingRow } from "./types";

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Normalise dates to "yyyy-mm-dd hh:mm". Source slashed dates are D/M/YYYY (Malaysian). */
function normDateTime(s: string): string {
  if (!s) return "";
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])} ${pad(+m[4])}:${m[5]}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])} ${pad(+m[4])}:${m[5]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])} 00:00`;
  return s;
}

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

function mapRecord(rec: Record<string, string>): TeachingRow {
  const v = (k: string) => (rec[k] ?? "").trim();
  return {
    sessionStart: normDateTime(v("session_start_at")),
    sessionEnd: normDateTime(v("session_end_at")),
    className: v("class_name"),
    staffName: v("staff_name"),
    userName: v("user_full_name"),
    userEmail: v("user_email"),
    userPhone: digits(v("user_phone")),
    paidAt: normDateTime(v("paid_at")),
  };
}

const normHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_");

async function parseXlsx(buffer: ArrayBuffer | Buffer): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = normHeader(String(cell.value ?? ""));
  });
  const out: Record<string, string>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const rec: Record<string, string> = {};
    row.eachCell((cell, col) => {
      const h = headers[col];
      if (!h) return;
      const v = cell.value;
      if (v instanceof Date) {
        rec[h] = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
      } else if (v != null && typeof v === "object" && "text" in v) {
        rec[h] = String((v as { text: unknown }).text ?? "");
      } else {
        rec[h] = v == null ? "" : String(v);
      }
    });
    out.push(rec);
  });
  return out;
}

/** Parse a CSV or .xlsx attendees export into unified rows (blank lines dropped). */
export async function parseTeachingFile(
  buffer: ArrayBuffer | Buffer,
  filename: string,
): Promise<TeachingRow[]> {
  let records: Record<string, string>[];
  if (/\.csv$/i.test(filename)) {
    const text = Buffer.from(buffer as Buffer).toString("utf-8").replace(/^﻿/, "");
    records = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normHeader,
    }).data;
  } else {
    records = await parseXlsx(buffer);
  }
  return records.map(mapRecord).filter((r) => r.className || r.staffName || r.userName);
}
