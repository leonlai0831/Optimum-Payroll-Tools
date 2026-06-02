"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Wand2 } from "lucide-react";
import { Button, Card, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { rm } from "@/lib/utils";
import type { IncomeReport } from "@/lib/earnings/income";

export function IncomeReportBuilder({ runs }: { runs: { id: number; periodLabel: string }[] }) {
  const toast = useToast();
  const [runId, setRunId] = useState<string>(runs[0] ? String(runs[0].id) : "");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<IncomeReport | null>(null);
  const [monthLabel, setMonthLabel] = useState("");
  const [busy, setBusy] = useState<"gen" | "dl" | null>(null);

  async function generate() {
    if (!runId) return toast.error("Select a saved commission month.");
    if (!file) return toast.error("Upload the coaching (class attendees) file.");
    setBusy("gen");
    try {
      const fd = new FormData();
      fd.append("runId", runId);
      fd.append("file", file);
      const res = await fetch("/api/commission/income", { method: "POST", body: fd });
      const data = (await res.json()) as { report: IncomeReport; monthLabel: string; error?: string; message?: string };
      if (!res.ok) throw new Error(data.message || data.error || "Failed to build report");
      setReport(data.report);
      setMonthLabel(data.monthLabel);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to build report");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!report) return;
    setBusy("dl");
    try {
      const res = await fetch("/api/commission/income/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthLabel, report }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `optimum_fit_${(monthLabel || "month").toLowerCase().replace(/[^a-z0-9]+/g, "_")}_staff_earnings.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  if (runs.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-gray-500">
        Save a commission month first (Commission → Save to history), then come back to merge it with coaching income.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-sm font-bold text-gray-900">Per-staff income report</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Combine a saved commission month with the coaching (class attendees) export — matched per person by name.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-overline text-muted">Commission month</label>
            <Select value={runId} onChange={(e) => setRunId(e.target.value)} className="mt-1 w-48">
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.periodLabel}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">
            <FileSpreadsheet className={file ? "h-4 w-4 text-green-600" : "h-4 w-4 text-gray-400"} />
            <span className="max-w-48 truncate">{file?.name ?? "Coaching file (CSV / .xlsx)…"}</span>
            <input type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Button onClick={generate} disabled={busy !== null}>
            {busy === "gen" ? <Spinner /> : <Wand2 className="h-4 w-4" />} Build report
          </Button>
          {report && (
            <Button variant="outline" onClick={download} disabled={busy !== null}>
              {busy === "dl" ? <Spinner /> : <Download className="h-4 w-4" />} Download Excel
            </Button>
          )}
        </div>
      </Card>

      {report && (
        <Card className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-overline text-muted">
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2 text-right">Commission</th>
                <th className="px-3 py-2 text-right">Coaching income</th>
                <th className="px-3 py-2 text-right">Total income</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.rows.map((row) => (
                <tr key={row.name + row.staffCode} className="tabular-nums">
                  <td className="px-3 py-2 text-gray-900">
                    {row.name}
                    {!row.inCommission && <span className="ml-2 text-xs text-gray-400">coaching only</span>}
                    {row.inCommission && !row.inCoaching && row.coachingIncome === 0 && null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{row.staffCode || "—"}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{rm(row.commission)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{rm(row.coachingIncome)}</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700">{rm(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 tabular-nums">
              <tr className="font-bold text-gray-900">
                <td className="px-3 py-2" colSpan={2}>
                  TOTAL
                </td>
                <td className="px-3 py-2 text-right">{rm(report.totals.commission)}</td>
                <td className="px-3 py-2 text-right">{rm(report.totals.coachingIncome)}</td>
                <td className="px-3 py-2 text-right text-green-700">{rm(report.totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
