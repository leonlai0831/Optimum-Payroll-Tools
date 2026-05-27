"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import type { AppraisalDimension, PerformanceConfig } from "@/lib/performance/types";

export function PerformanceOptionsForm({
  initial,
  canEdit = true,
}: {
  initial: PerformanceConfig;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [dims, setDims] = useState<AppraisalDimension[]>(() =>
    structuredClone(initial.dimensions),
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function setLabel(i: number, label: string) {
    setDims((d) => d.map((x, idx) => (idx === i ? { ...x, label } : x)));
    setSaved(false);
  }
  function remove(i: number) {
    setDims((d) => d.filter((_, idx) => idx !== i));
    setSaved(false);
  }
  function add() {
    setDims((d) => [...d, { key: "", label: "" }]);
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const dimensions = dims
        .map((d) => ({ key: d.key, label: d.label.trim() }))
        .filter((d) => d.label);
      const res = await fetch("/api/staff/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimensions }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <SlidersHorizontal className="h-5 w-5 text-indigo-500" /> Appraisal options
        </h1>
        {canEdit ? (
          <Button onClick={save} disabled={busy}>
            {busy ? <Spinner /> : <Save className="h-4 w-4" />} {saved ? "Saved ✓" : "Save options"}
          </Button>
        ) : (
          <span className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">
            Read-only
          </span>
        )}
      </div>
      {!canEdit && (
        <p className="text-sm text-gray-500">You have read-only access to these settings.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-indigo-700">
            Appraisal dimensions
          </h3>
          <p className="mb-3 text-[11px] text-gray-400">
            Each dimension is rated 1–5 on an appraisal; the overall score is their average on a
            0–100 scale. Editing here does not change past appraisals (their ratings are
            snapshotted).
          </p>
          <div className="space-y-2">
            {dims.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={d.label}
                  placeholder="Dimension name"
                  onChange={(e) => setLabel(i, e.target.value)}
                  className="max-w-sm py-1.5 text-sm"
                />
                <button
                  className="text-gray-300 transition hover:text-red-500"
                  onClick={() => remove(i)}
                  title="Remove dimension"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {dims.length === 0 && (
              <p className="text-sm text-gray-500">No dimensions — add at least one to score appraisals.</p>
            )}
          </div>
          <Button variant="outline" className="mt-3 px-3 py-1.5 text-xs" onClick={add}>
            <Plus className="h-3.5 w-3.5" /> Add dimension
          </Button>
        </Card>
      </fieldset>
    </div>
  );
}
