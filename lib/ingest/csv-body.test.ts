import { describe, expect, it } from "vitest";
import { parseCsvBody, resolveIngestBodyMode } from "./csv-body";
import { hasInstructorHeader, mapCsvRows } from "../kpi/csv";

describe("resolveIngestBodyMode", () => {
  it("explicit text/csv is CSV regardless of body, with or without a charset param", () => {
    expect(resolveIngestBodyMode("text/csv", "a,b\n1,2")).toBe("csv");
    expect(resolveIngestBodyMode("text/csv; charset=utf-8", '{"rows":[]}')).toBe("csv");
    expect(resolveIngestBodyMode("TEXT/CSV", "a,b")).toBe("csv");
  });

  it("missing or octet-stream content type sniffs the body: JSON when it parses, else CSV", () => {
    expect(resolveIngestBodyMode(null, '{"periodLabel":"2026-06","rows":[{}]}')).toBe("json");
    expect(resolveIngestBodyMode("", "Instructor,Center\nA,B")).toBe("csv");
    expect(resolveIngestBodyMode("application/octet-stream", '{"rows":[]}')).toBe("json");
    expect(resolveIngestBodyMode("application/octet-stream", "Instructor\nA")).toBe("csv");
  });

  it("every other content type keeps the original JSON behavior", () => {
    expect(resolveIngestBodyMode("application/json", '{"rows":[]}')).toBe("json");
    expect(resolveIngestBodyMode("application/json; charset=utf-8", "not json")).toBe("json");
    expect(resolveIngestBodyMode("text/plain", "Instructor\nA")).toBe("json");
  });
});

describe("parseCsvBody", () => {
  it("parses a headered CSV into row objects (CRLF + trailing blank lines ok)", () => {
    const res = parseCsvBody("Instructor,Center,UP\r\nCOBYS [BK],Berkeley,9\r\n\r\n");
    expect(res).toEqual({
      ok: true,
      rows: [{ Instructor: "COBYS [BK]", Center: "Berkeley", UP: "9" }],
    });
  });

  it("strips a leading BOM so the first header still resolves", () => {
    const res = parseCsvBody("﻿tr_name,cr_name\nHONG LI [BK],Berkeley\n");
    expect(res.ok).toBe(true);
    if (res.ok) expect(Object.keys(res.rows[0])[0]).toBe("tr_name");
  });

  it("feeds straight into the existing CSV-upload pipeline (flexible headers)", () => {
    const res = parseCsvBody(
      [
        "tr_name,cr_name,TTL-LVL,TTL-COLOR,Black,UP,STUDENT_STOP,STUDENT_ATTENDED_CLASS",
        "COBYS [BK],Berkeley,152,38,5,9,2,580",
      ].join("\n"),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(hasInstructorHeader(res.rows)).toBe(true);
    expect(mapCsvRows(res.rows)[0]).toMatchObject({
      Instructor: "COBYS [BK]",
      Center: "Berkeley",
      TotalStudent: 152,
      TotalColor: 38,
      Black: 5,
      LevelUp: 9,
      Stop: 2,
      Attended: 580,
    });
  });

  it("rejects an empty body and a header-only file with distinct messages", () => {
    expect(parseCsvBody("")).toEqual({ ok: false, error: "CSV body is empty." });
    expect(parseCsvBody("  \n \n")).toEqual({ ok: false, error: "CSV body is empty." });
    expect(parseCsvBody("Instructor,Center\n")).toEqual({
      ok: false,
      error: "CSV has a header row but no data rows.",
    });
  });

  it("rejects structurally broken CSV (unclosed quote) with the row number", () => {
    const res = parseCsvBody('Instructor,Center\n"COBYS,Berkeley\nNEXT,Row');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/CSV could not be parsed: .*\(data row \d+\)\./);
  });

  it("tolerates a ragged row (field-count mismatch), like the dashboard upload", () => {
    const res = parseCsvBody("Instructor,Center\nCOBYS,Berkeley,EXTRA\nMINA");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rows).toHaveLength(2);
  });
});
