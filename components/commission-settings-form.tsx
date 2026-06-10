"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { DEFAULT_COMMISSION_CONFIG } from "@/lib/commission/defaults";
import type { CommissionConfig } from "@/lib/commission/types";

export function CommissionSettingsForm({
  initial,
  canEdit,
}: {
  initial: CommissionConfig;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [cfg, setCfg] = useState<CommissionConfig>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);

  function updateBand(i: number, patch: Partial<CommissionConfig["bands"][number]>) {
    setCfg((c) => ({ ...c, bands: c.bands.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) }));
  }
  function addBand() {
    const last = cfg.bands[cfg.bands.length - 1];
    const minCount = last ? (last.maxCount ?? last.minCount) + 1 : 0;
    setCfg((c) => ({ ...c, bands: [...c.bands, { minCount, maxCount: null, rate: 0 }] }));
  }
  function removeBand(i: number) {
    setCfg((c) => ({ ...c, bands: c.bands.filter((_, idx) => idx !== i) }));
  }

  // Band field renderers shared by the mobile cards and the desktop table so
  // both stay wired to the same state updates.
  type Band = CommissionConfig["bands"][number];
  const minField = (b: Band, i: number, cls: string) => (
    <Input
      type="number"
      value={b.minCount}
      disabled={!canEdit}
      onChange={(e) => updateBand(i, { minCount: Number(e.target.value) })}
      className={cls}
    />
  );
  const maxField = (b: Band, i: number, cls: string) => (
    <Input
      type="number"
      value={b.maxCount ?? ""}
      placeholder="∞ (no limit)"
      disabled={!canEdit}
      onChange={(e) =>
        updateBand(i, { maxCount: e.target.value === "" ? null : Number(e.target.value) })
      }
      className={cls}
    />
  );
  const rateField = (b: Band, i: number, cls: string) => (
    <Input
      type="number"
      step="0.5"
      value={Math.round(b.rate * 1000) / 10}
      disabled={!canEdit}
      onChange={(e) => updateBand(i, { rate: Number(e.target.value) / 100 })}
      className={cls}
    />
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/commission/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      toast.success("Commission rate bands saved.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Commission rate bands</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              One company-wide rate is chosen by the month&apos;s <b>qualifying registration</b> count.
            </p>
          </div>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setCfg(structuredClone(DEFAULT_COMMISSION_CONFIG))}>
              <RotateCcw className="h-3.5 w-3.5" /> Defaults
            </Button>
          )}
        </div>

        {/* Phones: one card per band with labeled fields. Desktop: the compact table. */}
        <MobileCards className="mt-3">
          {cfg.bands.map((b, i) => (
            <div key={i} className="flex items-end gap-2 py-3 first:pt-0">
              <div className="grid flex-1 grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-overline text-muted">Min count</span>
                  {minField(b, i, "mt-1")}
                </label>
                <label className="block">
                  <span className="text-overline text-muted">Max count</span>
                  {maxField(b, i, "mt-1")}
                </label>
                <label className="block">
                  <span className="text-overline text-muted">Rate %</span>
                  {rateField(b, i, "mt-1")}
                </label>
              </div>
              {canEdit && (
                <button
                  onClick={() => removeBand(i)}
                  title="Remove band"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-gray-200 text-red-500 hover:bg-red-50 active:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </MobileCards>
        <DesktopTable className="mt-3">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-overline text-muted">
                <th className="px-2 py-1.5">Min count</th>
                <th className="px-2 py-1.5">Max count</th>
                <th className="px-2 py-1.5">Rate %</th>
                {canEdit && <th className="px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {cfg.bands.map((b, i) => (
                <tr key={i}>
                  <td className="px-2 py-1">{minField(b, i, "w-24")}</td>
                  <td className="px-2 py-1">{maxField(b, i, "w-28")}</td>
                  <td className="px-2 py-1">{rateField(b, i, "w-24")}</td>
                  {canEdit && (
                    <td className="px-2 py-1">
                      <Button variant="ghost" size="sm" onClick={() => removeBand(i)} title="Remove band">
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </DesktopTable>

        {canEdit && (
          <Button variant="outline" size="sm" onClick={addBand} className="mt-3">
            <Plus className="h-3.5 w-3.5" /> Add band
          </Button>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
          <label className="text-overline text-muted">Below-minimum rate %</label>
          <Input
            type="number"
            step="0.5"
            value={Math.round(cfg.belowMinRate * 1000) / 10}
            disabled={!canEdit}
            onChange={(e) => setCfg((c) => ({ ...c, belowMinRate: Number(e.target.value) / 100 }))}
            className="w-24"
          />
          <span className="text-xs text-gray-400">
            Applied (and flagged) when qualifying is below the lowest band.
          </span>
        </div>
      </Card>

      {canEdit && (
        <Button onClick={save} disabled={saving}>
          {saving ? <Spinner /> : <Save className="h-4 w-4" />} Save rate bands
        </Button>
      )}
    </div>
  );
}
