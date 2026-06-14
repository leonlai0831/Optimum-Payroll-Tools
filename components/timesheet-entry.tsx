"use client";

import { useMemo, useRef, useState } from "react";
import { Clock, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { MobileCards, DesktopTable } from "@/components/responsive-table";
import { cn } from "@/lib/utils";
import { CENTERS } from "@/lib/allowance/types";
import { SESSION_HOURS_TOLERANCE } from "@/lib/timesheet/validate";
import { groupSessionWindows, type SessionWindow } from "@/lib/timesheet/group";
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

/** The headline for a displayed record: a shift's span, a lesson window's
 *  clocked start–end, or a bare "Lesson" for a legacy window-less row. */
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

/** A single (class type, hours) line within a lesson session. Carries a stable
 *  client-only `_key` so removing a middle row never shifts focus onto its
 *  neighbour (see CLAUDE.md — reconcile list rows by key, never index). */
interface LessonLine {
  _key: number;
  classType: TimesheetClassType;
  hours: string;
}

/** Hours between two "HH:MM" strings, or null when invalid / non-positive. */
function spanHours(start: string, end: string): number | null {
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!re.test(start) || !re.test(end) || end <= start) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh + em / 60 - (sh + sm / 60);
}

export function TimesheetEntry({
  hasCoachProfile,
  entryMode,
  initialPeriod,
  initialEntries,
}: {
  hasCoachProfile: boolean;
  /** Fixed by the linked coach's job role — front desk logs a shift, everyone
   *  else logs a lesson session. There is no Lesson/Shift toggle. */
  entryMode: TimesheetEntryType;
  initialPeriod: string;
  initialEntries: Row[];
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [rows, setRows] = useState<Row[]>(initialEntries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-entry form state. The mode is fixed by `entryMode` (prop), not a toggle.
  // A lesson = a clocked window (start/end) holding one or more (classType, hours)
  // lines; a shift = just the start/end span.
  const [date, setDate] = useState(`${period}-01`);
  const [center, setCenter] = useState<string>(CENTERS[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState(entryMode === "shift" ? "17:00" : "10:00");
  const [lines, setLines] = useState<LessonLine[]>([{ _key: 1, classType: "low", hours: "1" }]);
  const lineKeyRef = useRef(1);
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

  // Collapse the per-line lesson rows back into the windows the coach actually
  // clocked, so the list shows — and delete acts on — the whole window. Rows that
  // differ in status (a half-reviewed window) stay separate so each shows the
  // right badge/note.
  const windows = useMemo(() => groupSessionWindows(rows, (r) => r.status), [rows]);

  const totals = useMemo(() => {
    const total = windows.reduce((s, w) => s + w.hours, 0);
    const drafts = windows.filter((w) => {
      const st = w.rows[0].status;
      return st === "draft" || st === "changes_requested";
    }).length;
    return { total, drafts };
  }, [windows]);

  // One row per class type (operator decision 2026-06-14): the type dropdown only
  // offers types not already in the session, and "Add class" adds the next unused
  // one (disabled once all are used). To log more of a type, raise its HOURS.
  const usedTypes = useMemo(() => new Set(lines.map((l) => l.classType)), [lines]);
  const allTypesUsed = usedTypes.size >= TIMESHEET_CLASS_TYPES.length;

  function addLine() {
    const next = TIMESHEET_CLASS_TYPES.find((c) => !usedTypes.has(c));
    if (!next) return;
    lineKeyRef.current += 1;
    const key = lineKeyRef.current;
    setLines((ls) => [...ls, { _key: key, classType: next, hours: "1" }]);
  }
  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l._key !== key) : ls));
  }
  function updateLine(key: number, patch: Partial<Omit<LessonLine, "_key">>) {
    setLines((ls) => ls.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  }

  // Live "sum vs span" gate for a lesson session: the class lines must total the
  // clocked window within tolerance, or the server (parseTimesheetSession) would
  // reject it — so we surface it and block submit.
  const span = useMemo(() => spanHours(startTime, endTime), [startTime, endTime]);
  const lineSum = useMemo(() => lines.reduce((s, l) => s + (Number(l.hours) || 0), 0), [lines]);
  const sessionOk =
    span != null &&
    lines.every((l) => Number(l.hours) > 0) &&
    Math.abs(lineSum - span) <= SESSION_HOURS_TOLERANCE;

  async function addEntry() {
    setBusy(true);
    setError(null);
    try {
      const body =
        entryMode === "lesson"
          ? {
              periodLabel: period,
              date,
              center,
              startTime,
              endTime,
              lines: lines.map((l) => ({ classType: l.classType, hours: Number(l.hours) })),
              note,
            }
          : { periodLabel: period, date, center, entryType: "shift", startTime, endTime, note };
      const res = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add");
      setNote("");
      if (entryMode === "lesson") {
        lineKeyRef.current += 1;
        setLines([{ _key: lineKeyRef.current, classType: "low", hours: "1" }]);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  // Delete a whole clocked window at once — every per-line row that shares it.
  async function removeWindow(ids: number[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/timesheets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
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

      {/* Add entry — the mode is fixed by the coach's role (no toggle). */}
      <Card className="space-y-3 p-5">
        <div className="text-sm font-semibold text-gray-900">
          {entryMode === "lesson" ? "Lesson session" : "Front-desk shift"}
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
          <div>
            <Label htmlFor="ts-start">Start</Label>
            <Input id="ts-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ts-end">End</Label>
            <Input id="ts-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        {entryMode === "lesson" && (
          <div className="space-y-2">
            <Label>Classes taught in this window</Label>
            <p className="text-xs text-gray-500">
              Enter <strong>hours</strong>, not class count — each class is 1 h, except Young
              Swimmer at 0.5 h/class (so 2 Young Swimmer classes = 1&nbsp;h). One row per class
              type; to log more of a type, raise its hours.
            </p>
            <div className="flex items-center gap-2 px-0.5 text-xs font-medium text-gray-500">
              <span className="flex-1">Class</span>
              <span className="w-24">Hours</span>
              <span className="w-9" aria-hidden />
            </div>
            {lines.map((line, i) => (
              <div key={line._key} className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    aria-label={`Class type, line ${i + 1}`}
                    value={line.classType}
                    onChange={(e) =>
                      updateLine(line._key, { classType: e.target.value as TimesheetClassType })
                    }
                  >
                    {TIMESHEET_CLASS_TYPES.filter(
                      (c) => c === line.classType || !usedTypes.has(c),
                    ).map((c) => (
                      <option key={c} value={c}>
                        {TIMESHEET_CLASS_TYPE_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-24">
                  <Input
                    aria-label={`Hours, line ${i + 1}`}
                    type="number"
                    min="0"
                    step="0.5"
                    value={line.hours}
                    onChange={(e) => updateLine(line._key, { hours: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(line._key)}
                  disabled={lines.length === 1}
                  aria-label={`Remove line ${i + 1}`}
                  className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addLine} disabled={allTypesUsed}>
              <Plus className="h-4 w-4" /> Add class
            </Button>
            <p
              className={cn(
                "text-xs",
                span == null ? "text-amber-600" : sessionOk ? "text-green-700" : "text-red-600",
              )}
            >
              {span == null
                ? "Enter a valid start and end time."
                : `Classes total ${lineSum.toFixed(2)} h · clocked ${span.toFixed(2)} h${
                    sessionOk ? "" : ` — must match within ${SESSION_HOURS_TOLERANCE} h`
                  }`}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="ts-note">Note (optional)</Label>
            <Input id="ts-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. covered for X" />
          </div>
          <Button onClick={addEntry} disabled={busy || (entryMode === "lesson" && !sessionOk)}>
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
              {windows.map((w) => {
                const st = w.rows[0].status;
                const reviewNote = w.rows[0].reviewNote;
                const breakdown = w.entryType === "lesson" ? classBreakdown(w) : "";
                return (
                  <div key={w.key} className="space-y-1 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{w.date}</span>
                      <Badge className={STATUS_STYLE[st]}>{STATUS_LABEL[st]}</Badge>
                    </div>
                    <div className="text-sm text-gray-600">
                      {w.center} · {windowLabel(w)} · {w.hours.toFixed(2)} h
                    </div>
                    {breakdown && <div className="text-xs text-gray-500">{breakdown}</div>}
                    {st === "changes_requested" && reviewNote && (
                      <p className="text-xs text-red-600">Reviewer: {reviewNote}</p>
                    )}
                    {st === "draft" && (
                      <button
                        type="button"
                        onClick={() => removeWindow(w.ids)}
                        disabled={busy}
                        className="mt-1 inline-flex items-center gap-1 text-sm text-red-600 hover:underline disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    )}
                  </div>
                );
              })}
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
                  {windows.map((w) => {
                    const st = w.rows[0].status;
                    const reviewNote = w.rows[0].reviewNote;
                    const breakdown = w.entryType === "lesson" ? classBreakdown(w) : "";
                    return (
                      <tr key={w.key} className="border-b border-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{w.date}</td>
                        <td className="px-4 py-2">{w.center}</td>
                        <td className="px-4 py-2">
                          {windowLabel(w)}
                          {breakdown && (
                            <span className="block text-xs text-gray-500">{breakdown}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{w.hours.toFixed(2)}</td>
                        <td className="px-4 py-2">
                          <Badge className={STATUS_STYLE[st]}>{STATUS_LABEL[st]}</Badge>
                          {st === "changes_requested" && reviewNote && (
                            <span className="ml-2 text-xs text-red-600">{reviewNote}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {st === "draft" && (
                            <button
                              type="button"
                              onClick={() => removeWindow(w.ids)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 text-red-600 hover:underline disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" /> Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
