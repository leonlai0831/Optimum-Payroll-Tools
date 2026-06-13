"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { CENTERS } from "@/lib/allowance/types";
import {
  TIMESHEET_CLASS_TYPE_LABELS,
  TIMESHEET_CLASS_TYPES,
  type TimesheetClassType,
} from "@/lib/timesheet/types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Coach {
  id: number;
  canonicalName: string;
  employmentType: string;
}

interface SlotRow {
  _key: number;
  weekday: number;
  center: string;
  classType: TimesheetClassType | null;
  startTime: string;
  endTime: string;
}

export function FreelancerScheduleEditor() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [coachId, setCoachId] = useState<number | null>(null);
  const [rows, setRows] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const keyer = useRef(0);
  const nextKey = () => ++keyer.current;

  // Load the freelancer roster once.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/coaches");
        const all = (await res.json()) as Coach[];
        if (!res.ok) throw new Error("Failed to load coaches");
        setCoaches(all.filter((c) => c.employmentType === "freelancer"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load coaches");
      }
    })();
  }, []);

  const loadSchedule = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/freelancer-schedules?coachId=${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load schedule");
      setRows(
        (json.slots as Omit<SlotRow, "_key">[]).map((s) => ({ ...s, _key: nextKey() })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, []);

  function pickCoach(id: number | null) {
    setCoachId(id);
    setRows([]);
    if (id != null) void loadSchedule(id);
  }

  function addRow() {
    setSaved(false);
    setRows((rs) => [
      ...rs,
      { _key: nextKey(), weekday: 1, center: CENTERS[0], classType: "low", startTime: "17:00", endTime: "18:00" },
    ]);
  }

  function patchRow(key: number, patch: Partial<SlotRow>) {
    setSaved(false);
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    setSaved(false);
    setRows((rs) => rs.filter((r) => r._key !== key));
  }

  async function save() {
    if (coachId == null) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const slots = rows.map(({ weekday, center, classType, startTime, endTime }) => ({
        weekday,
        center,
        classType,
        startTime,
        endTime,
        effectiveFrom: null,
        effectiveTo: null,
      }));
      const res = await fetch(`/api/freelancer-schedules?coachId=${coachId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h1 className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
          <CalendarDays className="h-5 w-5 text-brand" /> Freelancer fixed schedules
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          A freelancer&apos;s recurring weekly slots. Clock-ins on a scheduled slot count as{" "}
          <strong>fixed</strong>; off-schedule ones are <strong>replacements</strong>; a scheduled
          slot with no clock-in is an <strong>absence</strong> (which forfeits the attendance bonus).
        </p>
        <div className="mt-3 max-w-sm">
          <Label htmlFor="fs-coach">Freelancer</Label>
          <Select
            id="fs-coach"
            value={coachId ?? ""}
            onChange={(e) => pickCoach(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select a freelancer…</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.canonicalName}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {coachId != null && (
        <Card className="space-y-3 p-5">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : (
            <>
              {rows.length === 0 && (
                <p className="text-sm text-gray-500">No slots yet — add the weekly schedule below.</p>
              )}
              {rows.map((r) => (
                <div key={r._key} className="grid grid-cols-2 gap-2 sm:grid-cols-6 sm:items-end">
                  <div>
                    <Label>Day</Label>
                    <Select
                      value={r.weekday}
                      onChange={(e) => patchRow(r._key, { weekday: Number(e.target.value) })}
                    >
                      {WEEKDAYS.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Center</Label>
                    <Select value={r.center} onChange={(e) => patchRow(r._key, { center: e.target.value })}>
                      {CENTERS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Class</Label>
                    <Select
                      value={r.classType ?? ""}
                      onChange={(e) =>
                        patchRow(r._key, {
                          classType: e.target.value ? (e.target.value as TimesheetClassType) : null,
                        })
                      }
                    >
                      <option value="">Front-desk shift</option>
                      {TIMESHEET_CLASS_TYPES.map((c) => (
                        <option key={c} value={c}>
                          {TIMESHEET_CLASS_TYPE_LABELS[c]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Start</Label>
                    <Input
                      type="time"
                      value={r.startTime}
                      onChange={(e) => patchRow(r._key, { startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>End</Label>
                    <Input
                      type="time"
                      value={r.endTime}
                      onChange={(e) => patchRow(r._key, { endTime: e.target.value })}
                    />
                  </div>
                  <div className="flex sm:justify-end">
                    <button
                      type="button"
                      onClick={() => removeRow(r._key)}
                      className="inline-flex items-center gap-1 py-2 text-sm text-red-600 hover:underline"
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={addRow}>
                  <Plus className="h-4 w-4" /> Add slot
                </Button>
                <div className="flex items-center gap-3">
                  {saved && <span className="text-sm text-green-700">Saved.</span>}
                  <Button onClick={save} disabled={busy}>
                    <Save className="h-4 w-4" /> Save schedule
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
