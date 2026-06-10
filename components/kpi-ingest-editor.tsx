"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calculator, Plus, Save, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Spinner } from "@/components/ui";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { useToast } from "@/components/toast";
import type { InstructorRow } from "@/lib/kpi/types";
import { cn } from "@/lib/utils";

/** Serializable projection of a kpi_ingests row (dates as ISO strings for the client). */
export interface IngestDetail {
  id: number;
  periodLabel: string;
  label: string;
  status: "pending" | "imported" | "discarded";
  rows: InstructorRow[];
  importedRunId: number | null;
  importedAt: string | null;
  receivedAt: string;
}

/** Numeric InstructorRow fields, in display order, with compact column labels. */
const NUM_FIELDS: { key: keyof InstructorRow & string; label: string }[] = [
  { key: "TotalStudent", label: "Students" },
  { key: "TotalColor", label: "Total color" },
  { key: "Black", label: "Black" },
  { key: "LevelUp", label: "Level up" },
  { key: "Downgrade", label: "Downgrade" },
  { key: "Switch", label: "Switch" },
  { key: "Stop", label: "Stop" },
  { key: "Attended", label: "Attended" },
];

function emptyRow(): InstructorRow {
  return {
    Center: "",
    Instructor: "",
    TotalStudent: 0,
    TotalColor: 0,
    Black: 0,
    LevelUp: 0,
    Downgrade: 0,
    Switch: 0,
    Stop: 0,
    Attended: 0,
  };
}

/**
 * Staged-delivery review screen: edit cells, delete rows, add rows — all local
 * until "Save changes" PATCHes the full row set back. "Load into calculator"
 * auto-saves any pending edits first, so what the calculator scores is always
 * exactly what this page shows. Read-only once the delivery is no longer pending.
 */
export function KpiIngestEditor({ ingest }: { ingest: IngestDetail }) {
  const router = useRouter();
  const toast = useToast();
  const editable = ingest.status === "pending";
  const [rows, setRows] = useState<InstructorRow[]>(ingest.rows);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "load" | "discard" | null>(null);

  function patchRow(idx: number, patch: Partial<InstructorRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty(true);
  }
  function deleteRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
    setDirty(true);
  }

  async function saveRows(): Promise<boolean> {
    const res = await fetch(`/api/kpi/ingests/${ingest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error || "Failed to save rows");
      return false;
    }
    setDirty(false);
    return true;
  }

  async function onSave() {
    setBusy("save");
    try {
      if (await saveRows()) toast.success("Rows saved.");
    } finally {
      setBusy(null);
    }
  }

  async function onLoad() {
    setBusy("load");
    try {
      // Persist pending edits first so the calculator scores exactly these rows.
      if (dirty && !(await saveRows())) return;
      router.push(`/kpi?ingest=${ingest.id}`);
    } finally {
      setBusy(null);
    }
  }

  async function onDiscard() {
    if (!window.confirm("Discard this delivery? It stays viewable here but can no longer be loaded.")) {
      return;
    }
    setBusy("discard");
    try {
      const res = await fetch(`/api/kpi/ingests/${ingest.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error || "Failed to discard");
        return;
      }
      toast.success("Delivery discarded.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const numField = (r: InstructorRow, idx: number, key: keyof InstructorRow & string, inputClass: string) => (
    <Input
      type="number"
      value={r[key] as number}
      onChange={(e) => patchRow(idx, { [key]: Number(e.target.value) || 0 })}
      className={inputClass}
      aria-label={key}
    />
  );

  return (
    <div className="space-y-4">
      {/* Header: meta + status + actions. */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-bold text-gray-900">
              {ingest.periodLabel}
              {ingest.status === "pending" && (
                <Badge className="border-amber-300 bg-amber-100 text-amber-800">Pending</Badge>
              )}
              {ingest.status === "imported" && (
                <Badge className="border-green-300 bg-green-100 text-green-800">Imported</Badge>
              )}
              {ingest.status === "discarded" && (
                <Badge className="border-gray-300 bg-gray-100 text-gray-600">Discarded</Badge>
              )}
            </h1>
            <p className="mt-0.5 text-xs text-gray-500">
              {ingest.label || "API upload"} · {rows.length} rows · received{" "}
              {new Date(ingest.receivedAt).toLocaleString()}
            </p>
            {ingest.status === "imported" && (
              <p className="mt-1 text-sm text-green-700">
                Imported{ingest.importedAt ? ` on ${new Date(ingest.importedAt).toLocaleDateString()}` : ""}
                {ingest.importedRunId != null && (
                  <>
                    {" — "}
                    <Link className="font-medium underline" href={`/kpi/history/${ingest.importedRunId}`}>
                      view the saved run →
                    </Link>
                  </>
                )}
              </p>
            )}
            {ingest.status === "discarded" && (
              <p className="mt-1 text-sm text-gray-500">
                This delivery was discarded — kept for the record, it can no longer be loaded.
              </p>
            )}
          </div>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onSave} disabled={busy !== null || !dirty}>
                {busy === "save" ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
              </Button>
              <Button onClick={onLoad} disabled={busy !== null}>
                {busy === "load" ? <Spinner /> : <Calculator className="h-4 w-4" />} Load into calculator
              </Button>
              <Button variant="danger" onClick={onDiscard} disabled={busy !== null}>
                {busy === "discard" ? <Spinner /> : <Trash2 className="h-4 w-4" />} Discard
              </Button>
            </div>
          )}
        </div>
        {editable && dirty && (
          <p className="mt-2 text-xs text-amber-700">
            Unsaved edits — “Save changes” keeps them, “Load into calculator” saves them first.
          </p>
        )}
      </Card>

      {/* Rows. */}
      <Card className="overflow-hidden">
        {/* Mobile (< lg): one editable card per row. */}
        <MobileCards>
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">No rows.</div>
          ) : (
            rows.map((r, idx) => (
              <div key={idx} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                  {editable && (
                    <button
                      type="button"
                      className="flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100"
                      onClick={() => deleteRow(idx)}
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  )}
                </div>
                {editable ? (
                  <>
                    <label className="block">
                      <span className="text-overline text-muted">Instructor</span>
                      <Input
                        value={r.Instructor}
                        onChange={(e) => patchRow(idx, { Instructor: e.target.value })}
                        className="mt-1 w-full py-2 text-base"
                      />
                    </label>
                    <label className="block">
                      <span className="text-overline text-muted">Center</span>
                      <Input
                        value={r.Center}
                        onChange={(e) => patchRow(idx, { Center: e.target.value })}
                        className="mt-1 w-full py-2 text-base"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {NUM_FIELDS.map(({ key, label }) => (
                        <label key={key} className="block">
                          <span className="text-overline text-muted">{label}</span>
                          <div className="mt-1">{numField(r, idx, key, "w-full py-2 text-base")}</div>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="font-semibold text-gray-900">{r.Instructor || "—"}</div>
                      <div className="text-[11px] text-gray-400">{r.Center || "—"}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {NUM_FIELDS.map(({ key, label }) => (
                        <div key={key} className="flex items-baseline justify-between gap-2">
                          <span className="text-[11px] text-gray-400">{label}</span>
                          <span className="nums text-sm font-medium text-gray-700">
                            {r[key] as number}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </MobileCards>

        {/* Desktop (lg+): the full editable table. */}
        <DesktopTable>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Instructor</th>
                <th className="px-3 py-2 text-left">Center</th>
                {NUM_FIELDS.map(({ key, label }) => (
                  <th key={key} className="px-3 py-2 text-center">
                    {label}
                  </th>
                ))}
                {editable && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 12 : 11} className="px-3 py-8 text-center text-sm text-gray-500">
                    No rows.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={idx} className={cn(editable && "hover:bg-indigo-50/40")}>
                    <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                    {editable ? (
                      <>
                        <td className="px-3 py-2">
                          <Input
                            value={r.Instructor}
                            onChange={(e) => patchRow(idx, { Instructor: e.target.value })}
                            className="w-44 py-1 text-xs"
                            aria-label="Instructor"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={r.Center}
                            onChange={(e) => patchRow(idx, { Center: e.target.value })}
                            className="w-28 py-1 text-xs"
                            aria-label="Center"
                          />
                        </td>
                        {NUM_FIELDS.map(({ key }) => (
                          <td key={key} className="px-3 py-2 text-center">
                            {numField(r, idx, key, "w-20 py-1 text-center text-xs")}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-xs font-medium text-red-600 hover:text-red-800"
                            onClick={() => deleteRow(idx)}
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-medium text-gray-900">{r.Instructor || "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{r.Center || "—"}</td>
                        {NUM_FIELDS.map(({ key }) => (
                          <td key={key} className="nums px-3 py-2 text-center text-gray-600">
                            {r[key] as number}
                          </td>
                        ))}
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DesktopTable>

        {editable && (
          <div className="border-t border-gray-100 p-3">
            <Button variant="outline" onClick={addRow} disabled={busy !== null}>
              <Plus className="h-4 w-4" /> Add row
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
