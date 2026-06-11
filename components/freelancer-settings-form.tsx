"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, SlidersHorizontal } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { useToast } from "@/components/toast";
import {
  FREELANCER_POSITIONS,
  type FreelancerConfig,
  type FreelancerPosition,
} from "@/lib/freelancer/types";

export function FreelancerSettingsForm({
  initial,
  canEdit = true,
}: {
  initial: FreelancerConfig;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [cfg, setCfg] = useState<FreelancerConfig>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);

  function patchRate(pos: FreelancerPosition, key: "groupA" | "groupB", val: number) {
    setCfg((c) => ({ ...c, rates: { ...c.rates, [pos]: { ...c.rates[pos], [key]: val } } }));
  }
  function patchMatrix(r: number, c: number, val: number) {
    setCfg((prev) => ({
      ...prev,
      commitment: {
        ...prev.commitment,
        values: prev.commitment.values.map((row, ri) =>
          ri === r ? row.map((v, ci) => (ci === c ? val : v)) : row,
        ),
      },
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/freelancer/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Save failed");
      }
      toast.success("Freelancer settings saved.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const groupALabel = cfg.groupACenters.join(" / ");
  const resultCols = cfg.commitment.resultThresholds;
  const hourRows = cfg.commitment.hourThresholds;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <SlidersHorizontal className="h-5 w-5 text-indigo-500" /> Settings
        </h1>
        {canEdit ? (
          <Button onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />} Save settings
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

      <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
        <Card className="p-4">
          <h3 className="mb-3 text-h3 text-gray-900">Hourly rates (RM / hour)</h3>
          <MobileCards>
            {FREELANCER_POSITIONS.map((p) => (
              <div key={p} className="py-3 first:pt-0 last:pb-0">
                <div className="text-sm font-semibold text-gray-700">{p}</div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-overline text-muted">Group A ({groupALabel})</span>
                    <Input
                      type="number"
                      className="mt-1"
                      value={cfg.rates[p].groupA}
                      onChange={(e) => patchRate(p, "groupA", Number(e.target.value) || 0)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-overline text-muted">Group B (others)</span>
                    <Input
                      type="number"
                      className="mt-1"
                      value={cfg.rates[p].groupB}
                      onChange={(e) => patchRate(p, "groupB", Number(e.target.value) || 0)}
                    />
                  </label>
                </div>
              </div>
            ))}
          </MobileCards>
          <DesktopTable>
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-2 py-1 text-left">Position</th>
                  <th className="px-2 py-1 text-left">Group A ({groupALabel})</th>
                  <th className="px-2 py-1 text-left">Group B (others)</th>
                </tr>
              </thead>
              <tbody>
                {FREELANCER_POSITIONS.map((p) => (
                  <tr key={p} className="border-t border-gray-100">
                    <td className="px-2 py-1 font-semibold text-gray-700">{p}</td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        className="w-28 py-1 text-xs"
                        value={cfg.rates[p].groupA}
                        onChange={(e) => patchRate(p, "groupA", Number(e.target.value) || 0)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        className="w-28 py-1 text-xs"
                        value={cfg.rates[p].groupB}
                        onChange={(e) => patchRate(p, "groupB", Number(e.target.value) || 0)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTable>
          <p className="mt-2 text-[11px] text-gray-400">
            Changes apply to future calculations; saved months keep their own rate snapshot.
          </p>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-h3 text-gray-900">Commitment bonus matrix</h3>
          <p className="mb-3 text-[11px] text-gray-400">
            Rows are total service hours, columns the student result — both match the largest
            threshold ≤ the value. A1–A3 never earn commitment.
          </p>
          {/* A 4×3 grid of small numbers fits a phone — no card/table split needed. */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-2 py-1 text-left">Hours \ Result</th>
                  {resultCols.map((t, ci) => (
                    <th key={ci} className="px-2 py-1 text-left">
                      {t === 0 ? "< " + (resultCols[1] ?? 1) : `${t}+`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hourRows.map((h, ri) => (
                  <tr key={ri} className="border-t border-gray-100">
                    <td className="px-2 py-1 font-semibold text-gray-700">
                      {h === 0 ? `< ${hourRows[1] ?? "∞"} h` : `${h}+ h`}
                    </td>
                    {resultCols.map((_, ci) => (
                      <td key={ci} className="px-2 py-1">
                        <Input
                          type="number"
                          step="0.05"
                          className="w-20 py-1 text-xs"
                          value={cfg.commitment.values[ri]?.[ci] ?? 0}
                          onChange={(e) => patchMatrix(ri, ci, Number(e.target.value) || 0)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-h3 text-gray-900">Attendance bonus</h3>
          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="text-overline text-muted">Multiplier on fixed hours</span>
              <Input
                type="number"
                step="0.05"
                className="mt-1 w-28"
                value={cfg.attendanceBonus}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, attendanceBonus: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <p className="text-xs text-gray-400">
              Applied only when no center is marked absent that month (default 0.2 = +20%).
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-h3 text-gray-900">Paying entities &amp; center groups</h3>
          <div className="space-y-1.5 text-sm">
            {cfg.entities.map((e) => (
              <div key={e.key} className="flex flex-wrap items-baseline gap-2">
                <span className="w-12 font-semibold text-gray-700">{e.label}</span>
                <span className="text-gray-500">{e.centers.join(", ")}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-gray-400">
            Group A centers (town rate): {groupALabel}. Entities and groups are fixed for now —
            contact the developer to change them.
          </p>
        </Card>
      </fieldset>
    </div>
  );
}
