"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Settings, Trash2 } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { METRIC_LIBRARY } from "@/lib/kpi/metrics";
import type { AppConfig, MetricConfig } from "@/lib/kpi/types";
import { cn } from "@/lib/utils";

type ListKey = "personalKpi" | "centerKpi";

export function SettingsForm({
  initial,
  canEdit = true,
}: {
  initial: AppConfig;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [cfg, setCfg] = useState<AppConfig>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);

  function enabledWeight(list: MetricConfig[]) {
    return Math.round(list.filter((m) => m.enabled).reduce((s, m) => s + m.w, 0) * 100);
  }
  const personalOk = enabledWeight(cfg.personalKpi) === 100;
  const centerOk = enabledWeight(cfg.centerKpi) === 100;

  function patchMetric(key: ListKey, idx: number, patch: Partial<MetricConfig>) {
    setCfg((c) => {
      const list = c[key].map((m, i) => (i === idx ? { ...m, ...patch } : m));
      return { ...c, [key]: list };
    });
  }
  function removeMetric(key: ListKey, idx: number) {
    setCfg((c) => ({ ...c, [key]: c[key].filter((_, i) => i !== idx) }));
  }
  function addMetric(key: ListKey, id: string) {
    const def = METRIC_LIBRARY[id];
    if (!def) return;
    setCfg((c) => ({
      ...c,
      [key]: [
        ...c[key],
        { id: def.id, name: def.name, min: def.defaultMin, max: def.defaultMax, w: 0, type: def.type, enabled: true },
      ],
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Save failed");
      }
      toast.success("KPI settings saved.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const renderMetrics = (key: ListKey, ok: boolean) => {
    const list = cfg[key];
    const available = Object.values(METRIC_LIBRARY).filter((d) => !list.some((m) => m.id === d.id));
    return (
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-h3 text-gray-900">
            {key === "personalKpi" ? "Personal KPI metrics" : "Center KPI metrics"}
          </h3>
          <span className={cn("text-xs font-bold", ok ? "text-green-600" : "text-red-600")}>
            enabled total: {enabledWeight(list)}%
          </span>
        </div>
        <div className="space-y-2">
          {list.map((m, idx) => (
            <div key={m.id} className="grid grid-cols-12 items-center gap-2 rounded border border-gray-100 p-2">
              <label className="col-span-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={m.enabled}
                  onChange={(e) => patchMetric(key, idx, { enabled: e.target.checked })}
                />
                <span className={cn("font-medium", !m.enabled && "text-gray-400")}>{m.name}</span>
              </label>
              <div className="col-span-2">
                <Input
                  type="number"
                  step="any"
                  value={m.min}
                  onChange={(e) => patchMetric(key, idx, { min: Number(e.target.value) })}
                  className="py-1 text-xs"
                  title="min"
                />
              </div>
              <div className="col-span-2">
                <Input
                  type="number"
                  step="any"
                  value={m.max}
                  onChange={(e) => patchMetric(key, idx, { max: Number(e.target.value) })}
                  className="py-1 text-xs"
                  title="max"
                />
              </div>
              <div className="col-span-3 flex items-center gap-1">
                <Input
                  type="number"
                  value={Math.round(m.w * 100)}
                  onChange={(e) => patchMetric(key, idx, { w: Number(e.target.value) / 100 })}
                  className="py-1 text-xs"
                  title="weight %"
                />
                <span className="text-xs text-gray-400">%</span>
              </div>
              <button
                className="col-span-1 text-gray-300 hover:text-red-500"
                onClick={() => removeMetric(key, idx)}
                title="remove metric"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        {available.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-gray-400" />
            <Select
              value=""
              onChange={(e) => e.target.value && addMetric(key, e.target.value)}
              className="w-64 py-1 text-xs"
            >
              <option value="">Add a metric…</option>
              {available.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <p className="mt-2 text-[11px] text-gray-400">
          min/max are in each metric&apos;s native units (rates as decimals, e.g. 0.20; mgmt
          assessment &amp; student counts as whole numbers). Enabled weights must total 100%.
        </p>
      </Card>
    );
  };

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Settings className="h-5 w-5 text-indigo-500" /> Settings
        </h1>
        {canEdit ? (
          <Button onClick={save} disabled={saving || !personalOk || !centerOk}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />} Save config
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
      {canEdit && (!personalOk || !centerOk) && (
        <p className="text-sm text-red-600">Enabled weights must total 100% in both sections to save.</p>
      )}

      <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
      {renderMetrics("personalKpi", personalOk)}
      {renderMetrics("centerKpi", centerOk)}

      <Card className="p-4">
        <h3 className="mb-3 text-h3 text-gray-900">
          Center student targets
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(cfg.centerTargets).map(([name, val]) => (
            <div key={name}>
              <Label className="truncate">{name}</Label>
              <Input
                type="number"
                value={val}
                className="mt-1 py-1 text-sm"
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    centerTargets: { ...c.centerTargets, [name]: Number(e.target.value) },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-h3 text-gray-900">
          Grade thresholds
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {(["S", "A", "B"] as const).map((g) => (
            <div key={g}>
              <Label>{g} ≥</Label>
              <Input
                type="number"
                step="any"
                value={cfg.gradeThresholds[g]}
                className="mt-1 py-1 text-sm"
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    gradeThresholds: { ...c.gradeThresholds, [g]: Number(e.target.value) },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </Card>
      </fieldset>
    </div>
  );
}
