"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, RotateCcw, Save, UploadCloud } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { computeTeaching } from "@/lib/teaching/calc";
import { rm } from "@/lib/utils";
import type { TeachingConfig, TeachingRow } from "@/lib/teaching/types";

export function TeachingCalculator({ initialConfig }: { initialConfig: TeachingConfig }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<TeachingRow[] | null>(null);
  const [monthLabel, setMonthLabel] = useState("");
  const [config, setConfig] = useState<TeachingConfig>(initialConfig);
  const [computing, setComputing] = useState(false);
  const [busy, setBusy] = useState<"download" | "save" | null>(null);

  // Recompute live as rates change — the engine is pure, so no server round-trip.
  const summary = useMemo(() => (rows ? computeTeaching(rows, config) : null), [rows, config]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setComputing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/teaching/compute", { method: "POST", body: fd });
      const data = (await res.json()) as {
        rows: TeachingRow[];
        config: TeachingConfig;
        monthLabel: string;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.message || data.error || "Compute failed");
      setRows(data.rows);
      setConfig(data.config);
      setMonthLabel(data.monthLabel);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Compute failed");
    } finally {
      setComputing(false);
    }
  }

  async function saveRates() {
    setBusy("save");
    try {
      const res = await fetch("/api/teaching/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Coaching-income rates saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!rows) return;
    setBusy("download");
    try {
      const res = await fetch("/api/teaching/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthLabel: monthLabel || "Coaching", rows, config }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `optimum_fit_${(monthLabel || "month").toLowerCase().replace(/[^a-z0-9]+/g, "_")}_coaching_income.xlsx`;
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

  function reset() {
    setRows(null);
    setMonthLabel("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <UploadCloud className="h-4 w-4 text-brand" /> Upload the month&apos;s class attendees export
        </h2>
        <p className="mt-0.5 text-xs text-gray-500">
          CSV or .xlsx with columns like <code>session_start_at, class_name, staff_name…</code>. PT (appointment)
          classes pay per attendee; group classes per session.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">
            <FileSpreadsheet className={rows ? "h-4 w-4 text-green-600" : "h-4 w-4 text-gray-400"} />
            <span className="truncate">{rows ? `${rows.length} session rows loaded` : "Choose CSV / .xlsx…"}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {computing && <Spinner className="text-brand" />}
          {rows && (
            <Button variant="ghost" onClick={reset} disabled={busy !== null}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          )}
        </div>
      </Card>

      {summary && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-overline text-muted">Period label</label>
                  <Input value={monthLabel} onChange={(e) => setMonthLabel(e.target.value)} className="mt-1 w-40" />
                </div>
                <div>
                  <label className="text-overline text-muted">PT rate / attendee</label>
                  <Input
                    type="number"
                    value={config.ptRate}
                    onChange={(e) => setConfig((c) => ({ ...c, ptRate: Number(e.target.value) }))}
                    className="mt-1 w-28"
                  />
                </div>
                <div>
                  <label className="text-overline text-muted">Group rate / session</label>
                  <Input
                    type="number"
                    value={config.groupRate}
                    onChange={(e) => setConfig((c) => ({ ...c, groupRate: Number(e.target.value) }))}
                    className="mt-1 w-28"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={saveRates} disabled={busy !== null}>
                  {busy === "save" ? <Spinner /> : <Save className="h-4 w-4" />} Save rates
                </Button>
                <Button variant="outline" onClick={download} disabled={busy !== null}>
                  {busy === "download" ? <Spinner /> : <Download className="h-4 w-4" />} Download Excel
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              PT classes match: <code>{config.ptKeywords.join(", ") || "—"}</code> (case-insensitive). Rates apply live;
              “Save rates” persists them for next month.
            </p>
          </Card>

          <Card className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-overline text-muted">
                  <th className="px-3 py-2">Coach</th>
                  <th className="px-3 py-2 text-right">PT sessions</th>
                  <th className="px-3 py-2 text-right">PT attendees</th>
                  <th className="px-3 py-2 text-right">PT income</th>
                  <th className="px-3 py-2 text-right">Group sessions</th>
                  <th className="px-3 py-2 text-right">Group income</th>
                  <th className="px-3 py-2 text-right">Total income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.coaches.map((c) => (
                  <tr key={c.staffName} className="tabular-nums">
                    <td className="px-3 py-2 text-gray-900">{c.staffName}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{c.ptSessions}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{c.ptAttendees}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{rm(c.ptIncome)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{c.groupSessions}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{rm(c.groupIncome)}</td>
                    <td className="px-3 py-2 text-right font-bold text-green-700">{rm(c.totalIncome)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 tabular-nums">
                <tr className="font-bold text-gray-900">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right">{summary.totals.ptSessions}</td>
                  <td className="px-3 py-2 text-right">{summary.totals.ptAttendees}</td>
                  <td className="px-3 py-2 text-right">{rm(summary.totals.ptIncome)}</td>
                  <td className="px-3 py-2 text-right">{summary.totals.groupSessions}</td>
                  <td className="px-3 py-2 text-right">{rm(summary.totals.groupIncome)}</td>
                  <td className="px-3 py-2 text-right text-green-700">{rm(summary.totals.totalIncome)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
