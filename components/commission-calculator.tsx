"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, RotateCcw, Save, UploadCloud } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { CommissionReport } from "@/components/commission-report";
import { commissionFileName } from "@/lib/commission/filename";
import type { CommissionConfig, CommissionRow, CommissionSummary } from "@/lib/commission/types";

type ComputeResult = {
  monthLabel: string;
  rows: CommissionRow[];
  summary: CommissionSummary;
  config: CommissionConfig;
  counts: { membership: number; subscription: number; package: number; total: number };
};

const SLOTS = [
  { key: "membership", label: "Membership / registration", match: ["membership", "registration"] },
  { key: "subscription", label: "Subscription", match: ["subscription"] },
  { key: "package", label: "Package", match: ["package"] },
] as const;
type SlotKey = (typeof SLOTS)[number]["key"];

function matchSlot(filename: string): SlotKey | null {
  const n = filename.toLowerCase();
  for (const s of SLOTS) if (s.match.some((m) => n.includes(m))) return s.key;
  return null;
}

export function CommissionCalculator() {
  const router = useRouter();
  const toast = useToast();
  const multiRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<Record<SlotKey, File | null>>({
    membership: null,
    subscription: null,
    package: null,
  });
  const [computing, setComputing] = useState(false);
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [periodLabel, setPeriodLabel] = useState("");
  const [busy, setBusy] = useState<"download" | "save" | null>(null);

  function setSlot(key: SlotKey, file: File | null) {
    setFiles((prev) => ({ ...prev, [key]: file }));
    setResult(null);
  }

  /** Auto-distribute a multi-file selection into the 3 slots by filename keyword. */
  function distribute(list: FileList | null) {
    if (!list) return;
    const next = { ...files };
    let assigned = 0;
    for (const file of Array.from(list)) {
      const slot = matchSlot(file.name);
      if (slot) {
        next[slot] = file;
        assigned++;
      }
    }
    setFiles(next);
    setResult(null);
    if (assigned === 0) toast.error("Couldn't match files by name — use the individual pickers below.");
    else toast.info(`Matched ${assigned} file${assigned === 1 ? "" : "s"} by name.`);
  }

  const allSelected = SLOTS.every((s) => files[s.key]);

  async function compute() {
    const missing = SLOTS.filter((s) => !files[s.key]).map((s) => s.label);
    if (missing.length > 0) {
      toast.error(`Select all 3 files. Missing: ${missing.join(", ")}.`);
      return;
    }
    setComputing(true);
    try {
      const fd = new FormData();
      for (const s of SLOTS) fd.append(s.key, files[s.key] as File);
      const res = await fetch("/api/commission/compute", { method: "POST", body: fd });
      const data = (await res.json()) as ComputeResult & { message?: string; error?: string };
      if (!res.ok) throw new Error(data.message || data.error || "Compute failed");
      setResult(data);
      setPeriodLabel(data.monthLabel);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Compute failed");
    } finally {
      setComputing(false);
    }
  }

  async function download() {
    if (!result) return;
    setBusy("download");
    try {
      const label = periodLabel.trim() || result.monthLabel;
      const res = await fetch("/api/commission/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthLabel: label, rows: result.rows, config: result.config }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = commissionFileName(label);
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

  async function save() {
    if (!result) return;
    if (!periodLabel.trim()) {
      toast.error("Enter a period label before saving.");
      return;
    }
    setBusy("save");
    try {
      const res = await fetch("/api/commission/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLabel: periodLabel.trim(),
          filename: result.monthLabel,
          rows: result.rows,
          config: result.config,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: number; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Save failed");
      toast.success("Saved to history.");
      router.push(`/commission/history/${data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setFiles({ membership: null, subscription: null, package: null });
    setResult(null);
    setPeriodLabel("");
    if (multiRef.current) multiRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <UploadCloud className="h-4 w-4 text-brand" /> Upload this month&apos;s 3 sales exports
          </h2>
          <label className="cursor-pointer text-xs font-medium text-brand hover:underline">
            Select all at once
            <input
              ref={multiRef}
              type="file"
              accept=".xlsx"
              multiple
              className="hidden"
              onChange={(e) => distribute(e.target.files)}
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {SLOTS.map((s) => (
            <div key={s.key} className="rounded-lg border border-dashed border-gray-300 p-3">
              <div className="text-xs font-semibold text-gray-700">{s.label}</div>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-gray-500">
                <FileSpreadsheet className={files[s.key] ? "h-4 w-4 text-green-600" : "h-4 w-4 text-gray-400"} />
                <span className="truncate">{files[s.key]?.name ?? "Choose .xlsx…"}</span>
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => setSlot(s.key, e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={compute} disabled={!allSelected || computing}>
            {computing ? <Spinner /> : <UploadCloud className="h-4 w-4" />}
            {computing ? "Computing…" : "Compute commission"}
          </Button>
          {(result || files.membership || files.subscription || files.package) && (
            <Button variant="ghost" onClick={reset} disabled={computing || busy !== null}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          )}
        </div>
      </Card>

      {result && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <label htmlFor="period" className="text-overline text-muted">
                Period label
              </label>
              <Input
                id="period"
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                placeholder="April 2026"
                className="mt-1 w-48"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={download} disabled={busy !== null}>
                {busy === "download" ? <Spinner /> : <Download className="h-4 w-4" />} Download Excel
              </Button>
              <Button onClick={save} disabled={busy !== null}>
                {busy === "save" ? <Spinner /> : <Save className="h-4 w-4" />} Save to history
              </Button>
            </div>
          </div>
        </Card>
      )}

      {result && <CommissionReport monthLabel={periodLabel || result.monthLabel} summary={result.summary} counts={result.counts} />}
    </div>
  );
}
