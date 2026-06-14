"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardCheck, Loader2, X } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { SelectAllCheckbox, useRowSelection } from "@/components/table-controls";
import { groupSessionWindows, type SessionWindow } from "@/lib/timesheet/group";
import { TIMESHEET_CLASS_TYPE_LABELS, type TimesheetClassType } from "@/lib/timesheet/types";

interface Row {
  id: number;
  coachId: number;
  coachName: string | null;
  periodLabel: string;
  date: string;
  center: string;
  entryType: "lesson" | "shift";
  classType: TimesheetClassType | null;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  note: string;
}

/** A displayed record's headline: a shift's span or a lesson window's clocked
 *  start–end (bare "Lesson" for a legacy window-less row). */
function windowLabel(w: SessionWindow<Row>): string {
  if (w.entryType === "shift") return `Shift ${w.startTime ?? ""}–${w.endTime ?? ""}`;
  return w.startTime && w.endTime ? `${w.startTime}–${w.endTime}` : "Lesson";
}

/** The per-class breakdown inside a lesson window: "Low 1.00 h · Medium 2.00 h". */
function classBreakdown(w: SessionWindow<Row>): string {
  return w.rows
    .filter((r) => r.classType)
    .map((r) => `${TIMESHEET_CLASS_TYPE_LABELS[r.classType!]} ${r.hours.toFixed(2)} h`)
    .join(" · ");
}

export function TimesheetReview({ initialEntries }: { initialEntries: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialEntries);
  // Selection is tracked by row id; a whole clocked window is selected/cleared
  // together (the reviewer acts on the window, not a single class line), so
  // every toggle goes through `toggleMany` over a window's / coach's row ids.
  const {
    selected,
    size: selectedCount,
    toggleMany,
    clear: clearSelection,
    stateOf,
    allSelected,
  } = useRowSelection<number>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group the queue by coach (preserving the query's coach-then-date order), then
  // collapse each coach's per-line lesson rows back into the clocked windows.
  const coachGroups = useMemo(() => {
    const map = new Map<number, { name: string; rows: Row[] }>();
    for (const r of rows) {
      const g = map.get(r.coachId) ?? { name: r.coachName ?? `Coach #${r.coachId}`, rows: [] };
      g.rows.push(r);
      map.set(r.coachId, g);
    }
    return [...map.entries()].map(([coachId, g]) => ({
      coachId,
      name: g.name,
      windows: groupSessionWindows(g.rows),
      rowIds: g.rows.map((r) => r.id),
      hours: g.rows.reduce((s, r) => s + r.hours, 0),
    }));
  }, [rows]);

  const allWindows = useMemo(() => coachGroups.flatMap((g) => g.windows), [coachGroups]);
  // Every clocked window's row ids, in display order — the scope of the
  // top-level "select all records" control.
  const allRowIds = useMemo(() => allWindows.flatMap((w) => w.ids), [allWindows]);
  const selectedWindows = useMemo(
    () => allWindows.filter((w) => allSelected(w.ids)).length,
    [allWindows, allSelected],
  );

  async function refresh() {
    setError(null);
    try {
      const res = await fetch("/api/timesheets/review");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setRows(json.entries as Row[]);
      clearSelection();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  async function review(action: "approve" | "request_changes") {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (action === "request_changes" && !note.trim()) {
      setError("Add a note when requesting changes.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/timesheets/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, note: note.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setNote("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h1 className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
          <ClipboardCheck className="h-5 w-5 text-brand" /> Timesheet review
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {allWindows.length === 0
            ? "Nothing awaiting review."
            : `${allWindows.length} submitted record${allWindows.length === 1 ? "" : "s"} · ${selectedWindows} selected`}
        </p>
        {allWindows.length > 0 && (
          <label className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-gray-700">
            <SelectAllCheckbox
              state={stateOf(allRowIds)}
              onChange={(on) => toggleMany(allRowIds, on)}
              aria-label="Select all records"
            />
            Select all records
          </label>
        )}
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {coachGroups.map((g) => {
        return (
          <Card key={g.coachId} className="p-0">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <label className="flex items-center gap-2 font-semibold text-gray-900">
                <SelectAllCheckbox
                  state={stateOf(g.rowIds)}
                  onChange={(on) => toggleMany(g.rowIds, on)}
                  aria-label={`Select all of ${g.name}`}
                />
                {g.name}
              </label>
              <span className="text-sm text-gray-500 tabular-nums">{g.hours.toFixed(2)} h</span>
            </div>
            <ul className="divide-y divide-gray-50">
              {g.windows.map((w) => {
                const note = w.rows[0].note;
                const breakdown = w.entryType === "lesson" ? classBreakdown(w) : "";
                const on = allSelected(w.ids);
                return (
                  <li key={w.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => toggleMany(w.ids, e.target.checked)}
                      className="h-4 w-4 accent-indigo-600"
                      aria-label={`Select ${w.date} ${w.center} record`}
                    />
                    <span className="w-24 font-medium text-gray-900">{w.date}</span>
                    <span className="w-12">{w.center}</span>
                    <span className="flex-1 text-gray-600">
                      {windowLabel(w)}
                      {breakdown && <span className="ml-2 text-gray-500">· {breakdown}</span>}
                      {note && <span className="ml-2 text-gray-400">· {note}</span>}
                    </span>
                    <span className="tabular-nums text-gray-700">{w.hours.toFixed(2)} h</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      {allWindows.length > 0 && (
        <Card className="sticky bottom-2 space-y-3 p-4">
          <div>
            <Label htmlFor="rv-note">Note (required to request changes)</Label>
            <Input id="rv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. split the Tuesday class into two rows" />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => review("request_changes")} disabled={busy || selectedCount === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Request changes
            </Button>
            <Button onClick={() => review("approve")} disabled={busy || selectedCount === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve selected
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
