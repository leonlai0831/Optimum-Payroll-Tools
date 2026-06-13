"use client";

import { useMemo, useState } from "react";
import { Clock, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { MobileCards, DesktopTable } from "@/components/responsive-table";
import { CENTERS } from "@/lib/allowance/types";
import {
  TIMESHEET_CLASS_TYPE_LABELS,
  TIMESHEET_CLASS_TYPES,
  type TimesheetClassType,
  type TimesheetEntryType,
} from "@/lib/timesheet/types";

type Status = "draft" | "submitted" | "approved" | "changes_requested";

interface Row {
  id: number;
  date: string;
  center: string;
  entryType: TimesheetEntryType;
  classType: TimesheetClassType | null;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  status: Status;
  reviewNote: string;
}

const STATUS_STYLE: Record<Status, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-700",
  changes_requested: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<Status, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  changes_requested: "Changes requested",
};

function describe(r: Row): string {
  if (r.entryType === "shift") return `Shift ${r.startTime ?? ""}–${r.endTime ?? ""}`;
  return r.classType ? TIMESHEET_CLASS_TYPE_LABELS[r.classType] : "Lesson";
}

export function TimesheetEntry({
  hasCoachProfile,
  initialPeriod,
  initialEntries,
}: {
  hasCoachProfile: boolean;
  initialPeriod: string;
  initialEntries: Row[];
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [rows, setRows] = useState<Row[]>(initialEntries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-entry form state.
  const [mode, setMode] = useState<TimesheetEntryType>("lesson");
  const [date, setDate] = useState(`${period}-01`);
  const [center, setCenter] = useState<string>(CENTERS[0]);
  const [classType, setClassType] = useState<TimesheetClassType>("low");
  const [hours, setHours] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [note, setNote] = useState("");

  // Re-fetch a month's entries. Always called from an event handler (never an
  // effect), so it doesn't trip set-state-in-effect; the first month is rendered
  // from server props.
  async function refresh(p: string = period) {
    if (!hasCoachProfile) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/timesheets?period=${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setRows(json.entries as Row[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // Switch month, keeping the add-form date inside the selected month.
  function changeMonth(p: string) {
    setPeriod(p);
    setDate((d) => (d.startsWith(p) ? d : `${p}-01`));
    void refresh(p);
  }

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.hours, 0);
    const drafts = rows.filter((r) => r.status === "draft" || r.status === "changes_requested").length;
    return { total, drafts };
  }, [rows]);

  async function addEntry() {
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === "lesson"
          ? { periodLabel: period, date, center, entryType: "lesson", classType, hours: Number(hours), note }
          : { periodLabel: period, date, center, entryType: "shift", startTime, endTime, note };
      const res = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add");
      setNote("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/timesheets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to delete");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  async function submitMonth() {
    if (!confirm(`Submit ${totals.drafts} entr${totals.drafts === 1 ? "y" : "ies"} for ${period} for review?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/timesheets/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodLabel: period }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to submit");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  }

  if (!hasCoachProfile) {
    return (
      <Card className="p-5">
        <h1 className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
          <Clock className="h-5 w-5 text-brand" /> Clock-in
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Your account isn&apos;t linked to a coach profile yet, so there&apos;s nowhere to file your
          hours. Ask an admin to link your login to your staff record.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
            <Clock className="h-5 w-5 text-brand" /> My timesheet
          </h1>
          <div className="flex items-center gap-2">
            <Label htmlFor="ts-month" className="text-sm">
              Month
            </Label>
            <Input
              id="ts-month"
              type="month"
              value={period}
              onChange={(e) => changeMonth(e.target.value)}
              className="w-auto"
            />
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          {totals.total.toFixed(2)} h logged · {totals.drafts} not yet submitted
        </p>
      </Card>

      {/* Add entry */}
      <Card className="space-y-3 p-5">
        <div className="flex gap-2">
          <Button
            variant={mode === "lesson" ? "primary" : "outline"}
            size="sm"
            onClick={() => setMode("lesson")}
          >
            Lesson
          </Button>
          <Button
            variant={mode === "shift" ? "primary" : "outline"}
            size="sm"
            onClick={() => setMode("shift")}
          >
            Front-desk shift
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="ts-date">Date</Label>
            <Input id="ts-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ts-center">Center</Label>
            <Select id="ts-center" value={center} onChange={(e) => setCenter(e.target.value)}>
              {CENTERS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          {mode === "lesson" ? (
            <>
              <div>
                <Label htmlFor="ts-class">Class type</Label>
                <Select
                  id="ts-class"
                  value={classType}
                  onChange={(e) => setClassType(e.target.value as TimesheetClassType)}
                >
                  {TIMESHEET_CLASS_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {TIMESHEET_CLASS_TYPE_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="ts-hours">Hours</Label>
                <Input
                  id="ts-hours"
                  type="number"
                  min="0"
                  step="0.25"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="ts-start">Start</Label>
                <Input id="ts-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ts-end">End</Label>
                <Input id="ts-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="ts-note">Note (optional)</Label>
            <Input id="ts-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. covered for X" />
          </div>
          <Button onClick={addEntry} disabled={busy}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Entries */}
      <Card className="p-0">
        {loading ? (
          <p className="flex items-center gap-2 p-5 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">No entries for {period} yet.</p>
        ) : (
          <>
            <MobileCards>
              {rows.map((r) => (
                <div key={r.id} className="space-y-1 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">{r.date}</span>
                    <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </div>
                  <div className="text-sm text-gray-600">
                    {r.center} · {describe(r)} · {r.hours.toFixed(2)} h
                  </div>
                  {r.status === "changes_requested" && r.reviewNote && (
                    <p className="text-xs text-red-600">Reviewer: {r.reviewNote}</p>
                  )}
                  {r.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      disabled={busy}
                      className="mt-1 inline-flex items-center gap-1 text-sm text-red-600 hover:underline disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  )}
                </div>
              ))}
            </MobileCards>

            <DesktopTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Center</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 text-right font-medium tabular-nums">Hours</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">{r.date}</td>
                      <td className="px-4 py-2">{r.center}</td>
                      <td className="px-4 py-2">{describe(r)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.hours.toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        {r.status === "changes_requested" && r.reviewNote && (
                          <span className="ml-2 text-xs text-red-600">{r.reviewNote}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.status === "draft" && (
                          <button
                            type="button"
                            onClick={() => remove(r.id)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 text-red-600 hover:underline disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DesktopTable>
          </>
        )}
      </Card>

      <div className="flex justify-end">
        <Button onClick={submitMonth} disabled={busy || totals.drafts === 0}>
          <Send className="h-4 w-4" /> Submit month for review
        </Button>
      </div>
    </div>
  );
}
