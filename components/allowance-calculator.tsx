"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { CenterSelect } from "@/components/center-select";
import { attendanceBracket, calcAllowance } from "@/lib/allowance/calc";
import { ALLOWANCE_TIERS } from "@/lib/allowance/types";
import type {
  AllowanceConfig,
  AllowanceInput,
  AllowanceResult,
  AllowanceTier,
  OtherAllowanceItem,
  TeachingHoursRow,
} from "@/lib/allowance/types";
import { cn, rm } from "@/lib/utils";

interface RosterCoach {
  id: number;
  canonicalName: string;
  center: string;
  allowanceTier: AllowanceTier | null;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const num = (v: string) => (v === "" ? 0 : Number(v) || 0);

export function AllowanceCalculator({
  config,
  coaches,
}: {
  config: AllowanceConfig;
  coaches: RosterCoach[];
}) {
  const [period, setPeriod] = useState(currentPeriod());
  const [coachId, setCoachId] = useState<number | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState("");
  const [tier, setTier] = useState<AllowanceTier>("T1");
  const [opHours, setOpHours] = useState(0);
  const [leaveHours, setLeaveHours] = useState(0);
  const [teachingRows, setTeachingRows] = useState<TeachingHoursRow[]>([]);
  const [otherItems, setOtherItems] = useState<OtherAllowanceItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [showReport, setShowReport] = useState(false);

  function dirty() {
    setSavedId(null);
  }

  // Center is keyed per row in the teaching section; the run-level center is the
  // distinct set of those, so there's no separate top-level center field.
  const center = [...new Set(teachingRows.map((r) => r.center.trim()).filter(Boolean))].join(", ");

  const input: AllowanceInput = {
    coachId,
    name: name.trim(),
    tier,
    center,
    opHours,
    leaveHours,
    teachingRows,
    otherItems,
  };
  const result = calcAllowance(input, config);
  const rates = config.teaching[tier];
  const noTeaching = rates.normal === 0 && rates.youngSwimmer === 0 && rates.precompLifesaving === 0;
  const bracket = attendanceBracket(result.attendancePct);

  function onPickCoach(value: string) {
    dirty();
    if (value === "__new__") {
      setIsNew(true);
      setCoachId(null);
      setName("");
      return;
    }
    if (value === "") {
      setIsNew(false);
      setCoachId(null);
      setName("");
      return;
    }
    const c = coaches.find((x) => x.id === Number(value));
    if (!c) return;
    setIsNew(false);
    setCoachId(c.id);
    setName(c.canonicalName);
    if (c.allowanceTier) setTier(c.allowanceTier);
  }

  function addTeachingRow() {
    setTeachingRows((r) => [...r, { center: "", normalH: 0, ysH: 0, precompH: 0 }]);
    dirty();
  }
  function updateTeachingRow(i: number, patch: Partial<TeachingHoursRow>) {
    setTeachingRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
    dirty();
  }
  function removeTeachingRow(i: number) {
    setTeachingRows((r) => r.filter((_, idx) => idx !== i));
    dirty();
  }

  function addOtherItem() {
    setOtherItems((r) => [...r, { center: "", reason: "", amount: 0 }]);
    dirty();
  }
  function updateOtherItem(i: number, patch: Partial<OtherAllowanceItem>) {
    setOtherItems((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
    dirty();
  }
  function removeOtherItem(i: number) {
    setOtherItems((r) => r.filter((_, idx) => idx !== i));
    dirty();
  }

  function rowTeaching(row: TeachingHoursRow): number {
    return (
      row.normalH * rates.normal +
      row.ysH * rates.youngSwimmer +
      row.precompH * rates.precompLifesaving
    );
  }

  async function save() {
    if (!input.name) {
      setError("Pick or name a staff member first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/allowance/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodLabel: period, input }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || "Save failed");
      const { id } = (await res.json()) as { id: number };
      setSavedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={cn("space-y-4", showReport && "no-print")}>
        {/* Coach + period + actions */}
        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="period">Period</Label>
                <Input
                  id="period"
                  type="month"
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    dirty();
                  }}
                  className="mt-1"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label>Staff</Label>
                <Select
                  className="mt-1"
                  value={isNew ? "__new__" : coachId === null ? "" : String(coachId)}
                  onChange={(e) => onPickCoach(e.target.value)}
                >
                  <option value="">— select —</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.canonicalName}
                      {c.allowanceTier ? ` (${c.allowanceTier})` : ""}
                    </option>
                  ))}
                  <option value="__new__">+ new staff…</option>
                </Select>
              </div>
              <div>
                <Label>Position</Label>
                <Select
                  className="mt-1"
                  value={tier}
                  onChange={(e) => {
                    setTier(e.target.value as AllowanceTier);
                    dirty();
                  }}
                >
                  {ALLOWANCE_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowReport(true)} disabled={!input.name}>
                <FileText className="h-4 w-4" /> PDF report
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Spinner /> : <Save className="h-4 w-4" />}
                {savedId ? "Saved ✓" : "Save"}
              </Button>
            </div>
          </div>
          {isNew && (
            <div className="mt-3">
              <Label htmlFor="newname">New staff name</Label>
              <Input
                id="newname"
                className="mt-1 sm:w-72"
                placeholder="e.g. JANE TAN"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  dirty();
                }}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Saving creates a staff profile, reused next time (and linked to KPI for instructors).
              </p>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {savedId && (
            <p className="mt-2 text-sm text-green-700">
              Saved.{" "}
              <Link className="underline" href="/allowance/history">
                View in history →
              </Link>
            </p>
          )}
        </Card>

        {/* 1. Attendance */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-indigo-700">
            1 · Attendance
          </h3>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>Operating hours</Label>
              <Input
                type="number"
                className="mt-1 w-28"
                value={opHours}
                onChange={(e) => {
                  setOpHours(num(e.target.value));
                  dirty();
                }}
              />
            </div>
            <div>
              <Label>Leave hours</Label>
              <Input
                type="number"
                className="mt-1 w-28"
                value={leaveHours}
                onChange={(e) => {
                  setLeaveHours(num(e.target.value));
                  dirty();
                }}
              />
            </div>
            <div className="text-sm">
              <p className="text-gray-500">Attendance</p>
              <p
                className={cn(
                  "text-lg font-bold",
                  bracket === "none" ? "text-red-600" : "text-gray-900",
                )}
              >
                {(result.attendancePct * 100).toFixed(2)}%
              </p>
            </div>
            <div className="text-sm">
              <p className="text-gray-500">Allowance</p>
              <p className="text-lg font-bold text-green-700">{rm(result.attendance)}</p>
            </div>
            <p className="text-xs text-gray-400">
              {bracket === "none"
                ? "Below 95% → no attendance allowance."
                : bracket === "perfect"
                  ? "100% attendance → perfect-rate allowance."
                  : "95%+ attendance → standard allowance."}
            </p>
          </div>
        </Card>

        {/* 2. Teaching */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-700">
              2 · Teaching hours
            </h3>
            <span className="text-sm font-bold text-green-700">{rm(result.teaching)}</span>
          </div>
          <p className="mb-3 text-[11px] text-gray-400">
            {noTeaching
              ? `Tier ${tier} earns no teaching allowance.`
              : `Rates (RM/hr) for ${tier} — LTS ${rates.normal} · YS ${rates.youngSwimmer} · PC & LS ${rates.precompLifesaving}.`}
          </p>
          {teachingRows.length > 0 && (
            <div className="space-y-2">
              <div className="hidden grid-cols-12 gap-2 px-1 text-[10px] uppercase tracking-wide text-gray-400 sm:grid">
                <span className="col-span-4">Center</span>
                <span className="col-span-2 text-center">LTS</span>
                <span className="col-span-2 text-center">YS</span>
                <span className="col-span-2 text-center">PC &amp; LS</span>
                <span className="col-span-2 text-right">Subtotal</span>
              </div>
              {teachingRows.map((row, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-2">
                  <CenterSelect
                    className="col-span-4 py-1 text-xs"
                    value={row.center}
                    onChange={(v) => updateTeachingRow(i, { center: v })}
                  />
                  <Input
                    type="number"
                    className="col-span-2 py-1 text-xs"
                    value={row.normalH}
                    onChange={(e) => updateTeachingRow(i, { normalH: num(e.target.value) })}
                  />
                  <Input
                    type="number"
                    className="col-span-2 py-1 text-xs"
                    value={row.ysH}
                    onChange={(e) => updateTeachingRow(i, { ysH: num(e.target.value) })}
                  />
                  <Input
                    type="number"
                    className="col-span-2 py-1 text-xs"
                    value={row.precompH}
                    onChange={(e) => updateTeachingRow(i, { precompH: num(e.target.value) })}
                  />
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <span className="text-xs font-medium text-gray-700">{rm(rowTeaching(row))}</span>
                    <button
                      className="text-gray-300 hover:text-red-500"
                      onClick={() => removeTeachingRow(i)}
                      title="remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" className="mt-3 px-3 py-1.5 text-xs" onClick={addTeachingRow}>
            <Plus className="h-3.5 w-3.5" /> Add center
          </Button>
        </Card>

        {/* 3. Other */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-700">
              3 · Other allowances
            </h3>
            <span className="text-sm font-bold text-green-700">{rm(result.other)}</span>
          </div>
          {otherItems.length > 0 && (
            <div className="space-y-2">
              {otherItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-2">
                  <CenterSelect
                    className="col-span-4 py-1 text-xs"
                    value={item.center}
                    onChange={(v) => updateOtherItem(i, { center: v })}
                  />
                  <Input
                    className="col-span-5 py-1 text-xs"
                    placeholder="Reason"
                    value={item.reason}
                    onChange={(e) => updateOtherItem(i, { reason: e.target.value })}
                  />
                  <Input
                    type="number"
                    className="col-span-2 py-1 text-xs"
                    placeholder="RM"
                    value={item.amount}
                    onChange={(e) => updateOtherItem(i, { amount: num(e.target.value) })}
                  />
                  <button
                    className="col-span-1 text-gray-300 hover:text-red-500"
                    onClick={() => removeOtherItem(i)}
                    title="remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" className="mt-3 px-3 py-1.5 text-xs" onClick={addOtherItem}>
            <Plus className="h-3.5 w-3.5" /> Add item
          </Button>
        </Card>

        {/* Grand total */}
        <Card className="flex flex-col gap-1 bg-brand-light p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">
              Total monthly allowance
            </p>
            <p className="text-[11px] text-gray-500">
              Teaching subtotal {rm(result.teaching)} auto-fills this coach&apos;s KPI bonus for{" "}
              {period}.
            </p>
          </div>
          <p className="text-3xl font-extrabold text-brand">{rm(result.grandTotal)}</p>
        </Card>
      </div>

      {showReport && (
        <AllowanceReport
          input={input}
          result={result}
          period={period}
          rowTeaching={rowTeaching}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}

function AllowanceReport({
  input,
  result,
  period,
  rowTeaching,
  onClose,
}: {
  input: AllowanceInput;
  result: AllowanceResult;
  period: string;
  rowTeaching: (row: TeachingHoursRow) => number;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 print:static print:block print:overflow-visible print:bg-transparent print:p-0"
      onClick={onClose}
    >
      <div
        className="my-4 w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl print:my-0 print:max-w-none print:rounded-none print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Teaching Allowance Report</h2>
            <p className="text-sm text-gray-500">Period {period}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 no-print">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Staff</p>
            <p className="font-semibold text-gray-900">{input.name}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Position</p>
            <p className="font-semibold text-gray-900">{input.tier}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Center</p>
            <p className="font-semibold text-gray-900">{input.center || "—"}</p>
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <tbody>
            <tr className="border-t border-gray-200">
              <td className="py-2 font-semibold text-gray-700">Attendance</td>
              <td className="py-2 text-right text-gray-500">
                {input.opHours} op / {input.leaveHours} leave ·{" "}
                {(result.attendancePct * 100).toFixed(2)}%
              </td>
              <td className="py-2 text-right font-medium text-gray-900">{rm(result.attendance)}</td>
            </tr>
          </tbody>
        </table>

        {input.teachingRows.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-400">
              <tr className="border-t border-gray-200">
                <th className="py-1 text-left">Teaching — center</th>
                <th className="py-1 text-center">LTS</th>
                <th className="py-1 text-center">YS</th>
                <th className="py-1 text-center">PC &amp; LS</th>
                <th className="py-1 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {input.teachingRows.map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 text-gray-700">{row.center || "—"}</td>
                  <td className="py-1 text-center text-gray-600">{row.normalH}</td>
                  <td className="py-1 text-center text-gray-600">{row.ysH}</td>
                  <td className="py-1 text-center text-gray-600">{row.precompH}</td>
                  <td className="py-1 text-right text-gray-900">{rm(rowTeaching(row))}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-200 font-medium">
                <td className="py-1 text-gray-700" colSpan={4}>
                  Teaching subtotal
                </td>
                <td className="py-1 text-right text-gray-900">{rm(result.teaching)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {input.otherItems.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-400">
              <tr className="border-t border-gray-200">
                <th className="py-1 text-left">Other — center</th>
                <th className="py-1 text-left">Reason</th>
                <th className="py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {input.otherItems.map((item, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 text-gray-700">{item.center || "—"}</td>
                  <td className="py-1 text-gray-600">{item.reason || "—"}</td>
                  <td className="py-1 text-right text-gray-900">{rm(item.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-200 font-medium">
                <td className="py-1 text-gray-700" colSpan={2}>
                  Other subtotal
                </td>
                <td className="py-1 text-right text-gray-900">{rm(result.other)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <div className="mt-5 flex items-center justify-between border-t-2 border-gray-300 pt-3">
          <span className="text-sm font-bold uppercase tracking-wide text-gray-700">
            Grand total
          </span>
          <span className="text-2xl font-extrabold text-brand">{rm(result.grandTotal)}</span>
        </div>

        <div className="mt-6 flex justify-end gap-2 no-print">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
