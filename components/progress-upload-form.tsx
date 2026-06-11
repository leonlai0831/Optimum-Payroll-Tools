"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Lock, Send, X } from "lucide-react";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { hasInstructorHeader, mapCsvRows } from "@/lib/kpi/csv";
import type { InstructorRow } from "@/lib/kpi/types";

/** Default the month picker to the previous month — uploads are for a completed month. */
function previousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Manual door of the Student Progress module: pick a month, optionally label
 * the delivery, and parse a CSV client-side (PapaParse + mapCsvRows — the same
 * flexible headers the KPI dashboard upload accepts). The preview shows what
 * parsed before anything is sent; submit stages the rows via
 * POST /api/progress/uploads, exactly like an API push (same supersede +
 * closed-month behavior), then jumps to the staged delivery for review.
 */
export function ProgressUploadForm() {
  const router = useRouter();
  const toast = useToast();

  const [period, setPeriod] = useState(previousMonth);
  const [label, setLabel] = useState("");
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<InstructorRow[] | null>(null);
  const [parseError, setParseError] = useState("");
  const [closedError, setClosedError] = useState("");
  const [busy, setBusy] = useState<"parse" | "submit" | null>(null);

  async function onFile(file: File) {
    setBusy("parse");
    setParseError("");
    setClosedError("");
    setRows(null);
    setFilename(file.name);
    // Lazy-load PapaParse only when a file is actually parsed (same as the dashboard).
    const Papa = (await import("papaparse")).default;
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setBusy(null);
        const raw = res.data;
        if (raw.length === 0) {
          setParseError("The file has no data rows.");
          return;
        }
        if (!hasInstructorHeader(raw)) {
          setParseError(
            "No instructor column found — the file needs a header like Instructor / tr_name / coach.",
          );
          return;
        }
        setRows(mapCsvRows(raw));
        if (!label) setLabel(file.name);
      },
      error: () => {
        setBusy(null);
        setParseError("Could not parse the file as CSV.");
      },
    });
  }

  function clearFile() {
    setRows(null);
    setFilename("");
    setParseError("");
    setClosedError("");
  }

  async function submit() {
    if (!rows || !period) return;
    setBusy("submit");
    setClosedError("");
    try {
      const res = await fetch("/api/progress/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodLabel: period, label, rows }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        id?: number;
        superseded?: number;
        error?: string;
      };
      if (res.status === 409) {
        setClosedError(body.error || `${period} is already finalized.`);
        return;
      }
      if (!res.ok || body.id == null) {
        toast.error(body.error || "Failed to stage the upload.");
        return;
      }
      toast.success(
        `Staged ${rows.length} rows for ${period}.` +
          (body.superseded ? ` Superseded ${body.superseded} earlier pending ${body.superseded === 1 ? "delivery" : "deliveries"}.` : ""),
      );
      router.push(`/progress/${body.id}`);
    } finally {
      setBusy(null);
    }
  }

  const previewNames = rows
    ? [...new Set(rows.map((r) => r.Instructor).filter((n) => n && n !== "Unknown"))].slice(0, 5)
    : [];

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="progress-period">Month</Label>
            <Input
              id="progress-period"
              type="month"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setClosedError("");
              }}
              className="mt-1 w-full sm:w-44"
            />
          </div>
          <div>
            <Label htmlFor="progress-label">Label (optional)</Label>
            <Input
              id="progress-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. june-export.csv"
              maxLength={200}
              className="mt-1 w-full"
            />
          </div>
        </div>

        {rows === null ? (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            {busy === "parse" ? <Spinner /> : <FileUp className="h-4 w-4" />}
            {busy === "parse" ? "Parsing…" : "Choose CSV file"}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              disabled={busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ""; // allow re-picking the same file
                if (f) void onFile(f);
              }}
            />
          </label>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="break-words text-sm font-semibold text-gray-900">{filename}</div>
                <div className="nums mt-0.5 text-xs text-gray-500">
                  {rows.length} rows · {previewNames.length > 0 ? `first names: ${previewNames.join(", ")}${rows.length > previewNames.length ? ", …" : ""}` : "no instructor names found"}
                </div>
              </div>
              <button
                type="button"
                aria-label="Remove file"
                className="shrink-0 cursor-pointer rounded p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                onClick={clearFile}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {parseError && <p className="text-sm font-medium text-red-600">{parseError}</p>}

        {closedError && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{period} is closed</p>
              <p className="mt-0.5">
                This month already has an imported delivery or a finalized KPI run — reopen the
                run first, then upload the correction. ({closedError})
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={submit} disabled={busy !== null || rows === null || !period}>
            {busy === "submit" ? <Spinner /> : <Send className="h-4 w-4" />} Stage upload
          </Button>
          <p className="text-xs text-gray-500">
            Staged for review on the Months tab — nothing is scored or saved as a run yet.
          </p>
        </div>
      </Card>
    </div>
  );
}
