"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { CenterSelect } from "@/components/center-select";
import { StaffCombobox } from "@/components/staff-combobox";
import { useToast } from "@/components/toast";
import { calcFreelancer, rateFor } from "@/lib/freelancer/calc";
import { currentPeriod } from "@/lib/allowance/period";
import { MALAYSIAN_BANKS } from "@/lib/freelancer/banks";
import {
  FREELANCER_POSITIONS,
  RESULT_POSITIONS,
  type FreelancerCenterRow,
  type FreelancerConfig,
  type FreelancerExtraItem,
  type FreelancerInput,
  type FreelancerPosition,
} from "@/lib/freelancer/types";
import type { AllowanceTier } from "@/lib/allowance/types";
import { cn, rm2 } from "@/lib/utils";

export interface FreelancerRosterCoach {
  id: number;
  canonicalName: string;
  allowanceTier: AllowanceTier | null;
  icNo: string;
  bankName: string;
  bankAccount: string;
}

export interface FreelancerEditTarget {
  runId: number;
  periodLabel: string;
  input: FreelancerInput;
}

const num = (v: string) => (v === "" ? 0 : Number(v) || 0);

const isFreelancerPosition = (t: string | null): t is FreelancerPosition =>
  !!t && (FREELANCER_POSITIONS as readonly string[]).includes(t);

export function FreelancerCalculator({
  config,
  centers,
  coaches,
  initial,
}: {
  config: FreelancerConfig;
  /** Canonical operating-center list (allowanceConfig.centers). */
  centers: string[];
  coaches: FreelancerRosterCoach[];
  initial?: FreelancerEditTarget;
}) {
  const editing = !!initial;
  const toast = useToast();
  const [period, setPeriod] = useState(initial?.periodLabel ?? currentPeriod());
  const [coachId, setCoachId] = useState<number | null>(initial?.input.coachId ?? null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState(initial?.input.name ?? "");
  const [position, setPosition] = useState<FreelancerPosition>(initial?.input.position ?? "T1");
  const [icNo, setIcNo] = useState(initial?.input.icNo ?? "");
  const [bankName, setBankName] = useState(initial?.input.bankName ?? "");
  const [bankAccount, setBankAccount] = useState(initial?.input.bankAccount ?? "");
  const [centerRows, setCenterRows] = useState<FreelancerCenterRow[]>(
    initial?.input.centerRows ?? [],
  );
  const [blackCount, setBlackCount] = useState(initial?.input.blackCount ?? 0);
  const [colourCount, setColourCount] = useState(initial?.input.colourCount ?? 0);
  const [extras, setExtras] = useState<FreelancerExtraItem[]>(initial?.input.extras ?? []);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);

  function dirty() {
    setSavedId(null);
  }

  const input: FreelancerInput = {
    coachId,
    name: name.trim(),
    position,
    icNo: icNo.trim(),
    bankName: bankName.trim(),
    bankAccount: bankAccount.trim(),
    centerRows,
    blackCount,
    colourCount,
    extras,
  };
  const result = calcFreelancer(input, config);
  const hasResult = (RESULT_POSITIONS as readonly string[]).includes(position);

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
    if (isFreelancerPosition(c.allowanceTier)) setPosition(c.allowanceTier);
    // Carry-over: prefill payee details from the profile.
    setIcNo(c.icNo);
    setBankName(c.bankName);
    setBankAccount(c.bankAccount);
  }

  function updateRow(i: number, patch: Partial<FreelancerCenterRow>) {
    setCenterRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
    dirty();
  }
  function updateExtra(i: number, patch: Partial<FreelancerExtraItem>) {
    setExtras((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
    dirty();
  }

  async function save() {
    if (!input.name) {
      toast.error("Pick or name a freelancer first.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/freelancer/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodLabel: period, input }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || "Save failed");
      const { id } = (await res.json()) as { id: number };
      setSavedId(id);
      toast.success(editing ? "Payment updated." : "Payment saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {editing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
          <span className="text-amber-800">
            Editing <strong>{name}</strong> · {period} — saving replaces this record.
          </span>
          <Link href="/freelancer" className="font-medium text-indigo-600 hover:text-indigo-800">
            Start a new entry →
          </Link>
        </div>
      )}

      {/* Freelancer + period + actions */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="fl-period">Period</Label>
              {editing ? (
                <p className="mt-1 py-2 text-sm font-medium text-gray-900">{period}</p>
              ) : (
                <Input
                  id="fl-period"
                  type="month"
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    dirty();
                  }}
                  className="mt-1"
                />
              )}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Freelancer</Label>
              {editing ? (
                <p className="mt-1 py-2 text-sm font-medium text-gray-900">{name}</p>
              ) : (
                <StaffCombobox
                  className="mt-1"
                  options={coaches}
                  value={isNew ? "__new__" : coachId === null ? "" : String(coachId)}
                  onChange={onPickCoach}
                />
              )}
            </div>
            <div>
              <Label>Position</Label>
              <Select
                className="mt-1"
                value={position}
                onChange={(e) => {
                  setPosition(e.target.value as FreelancerPosition);
                  dirty();
                }}
              >
                {FREELANCER_POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />} {editing ? "Update" : "Save"}
          </Button>
        </div>
        {isNew && (
          <div className="mt-3">
            <Label htmlFor="fl-newname">New freelancer name</Label>
            <Input
              id="fl-newname"
              className="mt-1 sm:w-72"
              placeholder="e.g. JANE TAN"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                dirty();
              }}
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Saving creates a freelancer staff profile, reused next time.
            </p>
          </div>
        )}
        {savedId && (
          <p className="mt-2 text-sm text-green-700">
            {editing ? "Updated." : "Saved."}{" "}
            <Link className="underline" href="/freelancer/history">
              View in history →
            </Link>
          </p>
        )}
      </Card>

      {/* 1. Payee details */}
      <Card className="p-4">
        <h3 className="mb-3 text-h3 text-gray-900">1 · Payee details</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="fl-ic">IC No</Label>
            <Input
              id="fl-ic"
              className="mt-1"
              placeholder="e.g. 900101-14-5678"
              value={icNo}
              onChange={(e) => {
                setIcNo(e.target.value);
                dirty();
              }}
            />
          </div>
          <div>
            <Label htmlFor="fl-bank">Bank</Label>
            <Select
              id="fl-bank"
              className="mt-1"
              value={bankName}
              onChange={(e) => {
                setBankName(e.target.value);
                dirty();
              }}
            >
              <option value="">—</option>
              {MALAYSIAN_BANKS.map((b) => (
                <option key={b.code} value={b.name}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="fl-account">Bank account</Label>
            <Input
              id="fl-account"
              className="mt-1"
              inputMode="numeric"
              value={bankAccount}
              onChange={(e) => {
                setBankAccount(e.target.value);
                dirty();
              }}
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          Saved onto the freelancer&apos;s profile and used in the monthly bank-transfer file.
        </p>
      </Card>

      {/* 2. Hours per center */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-h3 text-gray-900">2 · Hours per center</h3>
          <span className="text-sm font-bold text-gray-700">
            {result.totalServiceHours} h total
          </span>
        </div>
        {centerRows.length > 0 && (
          <div className="space-y-2">
            <div className="hidden grid-cols-12 gap-2 px-1 text-[10px] uppercase tracking-wide text-gray-400 sm:grid">
              <span className="col-span-3">Center</span>
              <span className="col-span-2 text-center">Replaced h</span>
              <span className="col-span-2 text-center">Fixed h</span>
              <span className="col-span-2 text-center">Absent</span>
              <span className="col-span-3 text-right">Payment</span>
            </div>
            {centerRows.map((row, i) => {
              const payment = result.centerPayments[i];
              return (
                <div key={i} className="grid grid-cols-12 items-center gap-2">
                  <CenterSelect
                    className="col-span-6 py-1 text-xs sm:col-span-3"
                    centers={centers}
                    value={row.center}
                    onChange={(v) => updateRow(i, { center: v })}
                  />
                  <Input
                    type="number"
                    className="col-span-3 py-1 text-xs sm:col-span-2"
                    title="Replacement-class hours"
                    value={row.replacedHours}
                    onChange={(e) => updateRow(i, { replacedHours: num(e.target.value) })}
                  />
                  <Input
                    type="number"
                    className="col-span-3 py-1 text-xs sm:col-span-2"
                    title="Fixed-class hours"
                    value={row.fixedHours}
                    onChange={(e) => updateRow(i, { fixedHours: num(e.target.value) })}
                  />
                  <label className="col-span-6 flex items-center gap-2 text-xs text-gray-600 sm:col-span-2 sm:justify-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-indigo-600"
                      checked={row.absent}
                      onChange={(e) => updateRow(i, { absent: e.target.checked })}
                    />
                    Absent
                  </label>
                  <div className="col-span-6 flex items-center justify-end gap-1 sm:col-span-3">
                    <span className="text-xs font-medium text-gray-700">
                      {rateFor(position, row.center, config)}/h · {rm2(payment?.payment ?? 0)}
                    </span>
                    <button
                      className="text-gray-300 hover:text-red-500"
                      onClick={() => {
                        setCenterRows((r) => r.filter((_, idx) => idx !== i));
                        dirty();
                      }}
                      title="remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Button
          variant="outline"
          className="mt-3 px-3 py-1.5 text-xs"
          onClick={() => {
            setCenterRows((r) => [
              ...r,
              { center: "", replacedHours: 0, fixedHours: 0, absent: false },
            ]);
            dirty();
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add center
        </Button>
        <p className="mt-2 text-[11px] text-gray-400">
          Marking any center absent removes the attendance bonus (+
          {config.attendanceBonus * 100}% on fixed hours) for the whole month.
        </p>
      </Card>

      {/* 3. Student result */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-h3 text-gray-900">3 · Student result</h3>
          <span className="text-sm font-bold text-gray-700">
            {hasResult ? `${(result.result * 100).toFixed(1)}%` : "n/a"}
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="fl-black">Black count</Label>
            <Input
              id="fl-black"
              type="number"
              className="mt-1 w-28"
              disabled={!hasResult}
              value={blackCount}
              onChange={(e) => {
                setBlackCount(num(e.target.value));
                dirty();
              }}
            />
          </div>
          <div>
            <Label htmlFor="fl-colour">Colour count</Label>
            <Input
              id="fl-colour"
              type="number"
              className="mt-1 w-28"
              disabled={!hasResult}
              value={colourCount}
              onChange={(e) => {
                setColourCount(num(e.target.value));
                dirty();
              }}
            />
          </div>
          <p className="text-xs text-gray-400">
            {hasResult
              ? "Result = 1 − black/colour · feeds the commitment bonus."
              : `Position ${position} carries no student result (counts as 0).`}
          </p>
        </div>
      </Card>

      {/* 4. Extra payments */}
      <Card className="p-4">
        <h3 className="mb-2 text-h3 text-gray-900">4 · Extra payments</h3>
        {extras.length > 0 && (
          <div className="space-y-2">
            {extras.map((item, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <Select
                  className="col-span-4 py-1 text-xs sm:col-span-3"
                  value={item.entity}
                  onChange={(e) => updateExtra(i, { entity: e.target.value })}
                >
                  <option value="">Entity</option>
                  {config.entities.map((en) => (
                    <option key={en.key} value={en.key}>
                      {en.label}
                    </option>
                  ))}
                </Select>
                <Input
                  className="col-span-8 py-1 text-xs sm:col-span-6"
                  placeholder="Reason"
                  value={item.reason}
                  onChange={(e) => updateExtra(i, { reason: e.target.value })}
                />
                <Input
                  type="number"
                  className="col-span-10 py-1 text-xs sm:col-span-2"
                  placeholder="RM"
                  value={item.amount}
                  onChange={(e) => updateExtra(i, { amount: num(e.target.value) })}
                />
                <button
                  className="col-span-2 text-gray-300 hover:text-red-500 sm:col-span-1"
                  onClick={() => {
                    setExtras((r) => r.filter((_, idx) => idx !== i));
                    dirty();
                  }}
                  title="remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="outline"
          className="mt-3 px-3 py-1.5 text-xs"
          onClick={() => {
            setExtras((r) => [...r, { entity: config.entities[0]?.key ?? "", reason: "", amount: 0 }]);
            dirty();
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add item
        </Button>
      </Card>

      {/* Breakdown */}
      <Card className="p-4">
        <h3 className="mb-3 text-h3 text-gray-900">Breakdown</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-overline text-muted">Service hours</p>
            <p className="text-lg font-bold tabular-nums text-gray-900">
              {result.totalServiceHours}
            </p>
          </div>
          <div>
            <p className="text-overline text-muted">Result</p>
            <p className="text-lg font-bold tabular-nums text-gray-900">
              {(result.result * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-overline text-muted">Commitment</p>
            <p className="text-lg font-bold tabular-nums text-gray-900">
              +{(result.commitment * 100).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-overline text-muted">Attendance</p>
            <p
              className={cn(
                "text-lg font-bold tabular-nums",
                result.attendance > 0 ? "text-gray-900" : "text-red-600",
              )}
            >
              +{(result.attendance * 100).toFixed(0)}%
            </p>
          </div>
        </div>
        <div className="mt-4 divide-y divide-gray-100 border-t border-gray-200">
          {result.entityTotals.map((e) => (
            <div key={e.entity} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-gray-600">Paid by {e.label}</span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  e.amount > 0 ? "text-gray-900" : "text-gray-300",
                )}
              >
                {rm2(e.amount)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Grand total */}
      <Card className="flex flex-col gap-1 bg-brand-light p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            Total monthly payment
          </p>
          <p className="text-[11px] text-gray-500">
            Paid per company — see the breakdown above for who pays what.
          </p>
        </div>
        <p className="text-3xl font-extrabold text-brand">{rm2(result.grandTotal)}</p>
      </Card>
    </div>
  );
}
