"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Lock, Save } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { CenterSelect } from "@/components/center-select";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { useToast } from "@/components/toast";
import { calcAllowance } from "@/lib/allowance/calc";
import { extractCenterHours, mergeBulkRow, type BulkRow } from "@/lib/allowance/bulk";
import { ALLOWANCE_TIERS } from "@/lib/allowance/types";
import type { AllowanceConfig, AllowanceInput, AllowanceTier } from "@/lib/allowance/types";
import { cn, rm, splitCenters } from "@/lib/utils";

interface RosterCoach {
  id: number;
  canonicalName: string;
  center: string;
  allowanceTier: AllowanceTier | null;
}

interface Line extends BulkRow {
  dirty: boolean;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const num = (v: string) => (v === "" ? 0 : Number(v) || 0);

/** Hour fields shared by the mobile cards and the desktop table columns. */
const HOUR_FIELDS = [
  ["opHours", "Op hrs"],
  ["leaveHours", "Leave"],
  ["normalH", "LTS"],
  ["ysH", "YS"],
  ["precompH", "PC & LS"],
] as const;

export function AllowanceBulkEntry({
  config,
  coaches,
}: {
  config: AllowanceConfig;
  coaches: RosterCoach[];
}) {
  const toast = useToast();
  const [period, setPeriod] = useState(currentPeriod());
  const [center, setCenter] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [existing, setExisting] = useState<Record<string, AllowanceInput>>({});
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const centerOptions = useMemo(
    () => [...new Set(coaches.flatMap((c) => splitCenters(c.center)))].sort(),
    [coaches],
  );

  const rebuild = useCallback(
    (inputs: Record<string, AllowanceInput>) => {
      if (!center) {
        setLines([]);
        return;
      }
      const roster = coaches.filter((c) => splitCenters(c.center).includes(center));
      setLines(
        roster.map((c) => {
          const prior = inputs[c.canonicalName] ?? null;
          const hrs = extractCenterHours(prior, center);
          return {
            coachId: c.id,
            name: c.canonicalName,
            tier: (prior?.tier ?? c.allowanceTier ?? "T1") as AllowanceTier,
            center,
            opHours: prior?.opHours ?? 0,
            leaveHours: prior?.leaveHours ?? 0,
            normalH: hrs.normalH,
            ysH: hrs.ysH,
            precompH: hrs.precompH,
            dirty: false,
          };
        }),
      );
    },
    [center, coaches],
  );

  // (Re)load saved inputs whenever the period changes; rebuild rows on center change.
  useEffect(() => {
    const ctrl = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/allowance/period-inputs?period=${encodeURIComponent(period)}`,
          { signal: ctrl.signal },
        );
        const data = (await res.json()) as {
          locked: boolean;
          inputs: Record<string, AllowanceInput>;
        };
        setExisting(data.inputs ?? {});
        setLocked(!!data.locked);
        rebuild(data.inputs ?? {});
      } catch {
        if (!ctrl.signal.aborted) toast.error("Could not load this month.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => ctrl.abort();
  }, [period, rebuild, toast]);

  function update(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch, dirty: true } : l)));
  }

  // Memoized per-line totals: both layouts (mobile cards + desktop table) are
  // mounted, so an inline calcAllowance ran TWICE per line on every render —
  // including renders where no line changed. One pass per data change instead.
  const lineTotals = useMemo(() => {
    const totals = new Map<Line, number>();
    for (const l of lines) {
      totals.set(l, calcAllowance(mergeBulkRow(l, existing[l.name] ?? null), config).grandTotal);
    }
    return totals;
  }, [lines, existing, config]);
  const lineTotal = (l: Line): number => lineTotals.get(l) ?? 0;

  const dirtyLines = lines.filter((l) => l.dirty);

  async function saveAll() {
    if (dirtyLines.length === 0) {
      toast.error("Nothing changed to save.");
      return;
    }
    setSaving(true);
    let ok = 0;
    const failed: string[] = [];
    for (const l of dirtyLines) {
      const merged = mergeBulkRow(l, existing[l.name] ?? null);
      try {
        const res = await fetch("/api/allowance/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // bulkCenter tells the server this save edits only this center's
          // hours: it re-merges against the freshly stored record inside the
          // save transaction, so this client's possibly-stale `existing`
          // snapshot can't clobber another manager's just-saved centers.
          body: JSON.stringify({ periodLabel: period, input: merged, bulkCenter: center }),
        });
        if (!res.ok) throw new Error();
        ok += 1;
      } catch {
        failed.push(l.name);
      }
    }
    setSaving(false);
    if (ok > 0) toast.success(`Saved ${ok} record(s) for ${period}.`);
    if (failed.length > 0) toast.error(`Failed: ${failed.join(", ")}`);
    if (failed.length === 0) {
      // Refresh the saved snapshot so subsequent edits merge against fresh data.
      const data = await fetch(`/api/allowance/period-inputs?period=${encodeURIComponent(period)}`)
        .then((r) => r.json())
        .catch(() => null);
      if (data) {
        setExisting(data.inputs ?? {});
        setLines((ls) => ls.map((l) => ({ ...l, dirty: false })));
      }
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-md">
            <div>
              <Label htmlFor="bulk-period">Period</Label>
              <Input
                id="bulk-period"
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="bulk-center">Center</Label>
              <CenterSelect
                id="bulk-center"
                className="mt-1"
                centers={centerOptions.length ? centerOptions : config.centers}
                value={center}
                placeholder="Select…"
                onChange={(v) => {
                  setCenter(v);
                }}
              />
            </div>
          </div>
          <Button onClick={saveAll} disabled={saving || locked || dirtyLines.length === 0}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />} Save {dirtyLines.length || ""} changed
          </Button>
        </div>
        {locked && (
          <p className="mt-3 flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600">
            <Lock className="h-3.5 w-3.5" /> {period} is locked — entries are read-only.{" "}
            <Link href="/allowance/history" className="text-indigo-600 hover:underline">
              History
            </Link>
          </p>
        )}
      </Card>

      {!center ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          Pick a center to enter its staff allowances for {period}.
        </Card>
      ) : loading ? (
        <Card className="flex items-center justify-center p-8">
          <Spinner className="h-5 w-5 text-gray-400" />
        </Card>
      ) : lines.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          No active staff assigned to {center}.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <MobileCards>
            {lines.map((l, i) => (
              <div key={l.coachId ?? l.name} className={cn("p-4", l.dirty && "bg-amber-50/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 truncate font-semibold text-gray-900">{l.name}</div>
                  <div className="shrink-0 text-right">
                    <div className="text-base font-bold tabular-nums text-green-700">
                      {rm(lineTotal(l))}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {l.dirty ? "unsaved" : "total"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-overline text-muted">Tier</span>
                    <Select
                      value={l.tier}
                      disabled={locked}
                      onChange={(e) => update(i, { tier: e.target.value as AllowanceTier })}
                      className="mt-1"
                    >
                      {ALLOWANCE_TIERS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </label>
                  {HOUR_FIELDS.map(([field, label]) => (
                    <label key={field} className="block">
                      <span className="text-overline text-muted">{label}</span>
                      <Input
                        type="number"
                        disabled={locked}
                        className="mt-1"
                        value={l[field]}
                        onChange={(e) => update(i, { [field]: num(e.target.value) })}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </MobileCards>
          <DesktopTable>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Staff</th>
                  <th className="px-3 py-2 text-left">Tier</th>
                  {HOUR_FIELDS.map(([field, label]) => (
                    <th key={field} className="px-3 py-2 text-center">
                      {label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={l.coachId ?? l.name} className={cn(l.dirty && "bg-amber-50/40")}>
                    <td className="px-3 py-1.5 font-medium text-gray-900">{l.name}</td>
                    <td className="px-3 py-1.5">
                      <Select
                        value={l.tier}
                        disabled={locked}
                        onChange={(e) => update(i, { tier: e.target.value as AllowanceTier })}
                        className="w-20 py-1 text-xs"
                      >
                        {ALLOWANCE_TIERS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </Select>
                    </td>
                    {HOUR_FIELDS.map(([field]) => (
                      <td key={field} className="px-3 py-1.5 text-center">
                        <Input
                          type="number"
                          disabled={locked}
                          className="w-20 py-1 text-center text-xs"
                          value={l[field]}
                          onChange={(e) => update(i, { [field]: num(e.target.value) })}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-medium text-green-700">
                      {rm(lineTotal(l))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTable>
        </Card>
      )}
      {center && lines.length > 0 && (
        <p className="text-xs text-gray-400">
          Editing a staff member only updates their <strong>{center}</strong> hours; hours saved for
          their other centers are preserved. Total shown is the staff member&apos;s full month.
        </p>
      )}
    </div>
  );
}
