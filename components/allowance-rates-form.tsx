"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, Save } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { ALLOWANCE_TIERS } from "@/lib/allowance/types";
import type { AllowanceConfig, AllowanceTier } from "@/lib/allowance/types";

export function AllowanceRatesForm({ initial }: { initial: AllowanceConfig }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<AllowanceConfig>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function patchAttendance(tier: AllowanceTier, key: "met" | "perfect", val: number) {
    setCfg((c) => ({
      ...c,
      attendance: { ...c.attendance, [tier]: { ...c.attendance[tier], [key]: val } },
    }));
    setSaved(false);
  }
  function patchTeaching(
    tier: AllowanceTier,
    key: "normal" | "youngSwimmer" | "precompLifesaving",
    val: number,
  ) {
    setCfg((c) => ({
      ...c,
      teaching: { ...c.teaching, [tier]: { ...c.teaching[tier], [key]: val } },
    }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/allowance/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Coins className="h-5 w-5 text-indigo-500" /> Allowance Rates
        </h1>
        <Button onClick={save} disabled={saving}>
          {saving ? <Spinner /> : <Save className="h-4 w-4" />} {saved ? "Saved ✓" : "Save rates"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card className="overflow-x-auto p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-indigo-700">
          Attendance allowance (RM)
        </h3>
        <table className="min-w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-2 py-1 text-left">Tier</th>
              <th className="px-2 py-1 text-left">Met (95%–99%)</th>
              <th className="px-2 py-1 text-left">Perfect (100%)</th>
            </tr>
          </thead>
          <tbody>
            {ALLOWANCE_TIERS.map((t) => (
              <tr key={t} className="border-t border-gray-100">
                <td className="px-2 py-1 font-semibold text-gray-700">{t}</td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    className="w-28 py-1 text-xs"
                    value={cfg.attendance[t].met}
                    onChange={(e) => patchAttendance(t, "met", Number(e.target.value) || 0)}
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    className="w-28 py-1 text-xs"
                    value={cfg.attendance[t].perfect}
                    onChange={(e) => patchAttendance(t, "perfect", Number(e.target.value) || 0)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-indigo-700">
          Teaching rates (RM / hour)
        </h3>
        <table className="min-w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-2 py-1 text-left">Tier</th>
              <th className="px-2 py-1 text-left">LTS</th>
              <th className="px-2 py-1 text-left">YS</th>
              <th className="px-2 py-1 text-left">PC &amp; LS</th>
            </tr>
          </thead>
          <tbody>
            {ALLOWANCE_TIERS.map((t) => (
              <tr key={t} className="border-t border-gray-100">
                <td className="px-2 py-1 font-semibold text-gray-700">{t}</td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    className="w-24 py-1 text-xs"
                    value={cfg.teaching[t].normal}
                    onChange={(e) => patchTeaching(t, "normal", Number(e.target.value) || 0)}
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    className="w-24 py-1 text-xs"
                    value={cfg.teaching[t].youngSwimmer}
                    onChange={(e) => patchTeaching(t, "youngSwimmer", Number(e.target.value) || 0)}
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    className="w-24 py-1 text-xs"
                    value={cfg.teaching[t].precompLifesaving}
                    onChange={(e) =>
                      patchTeaching(t, "precompLifesaving", Number(e.target.value) || 0)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-gray-400">
          Admin tiers (A1–A3) and PA carry no teaching rate by default. Changes apply to future
          calculations; saved months keep their own rate snapshot.
        </p>
      </Card>
    </div>
  );
}
