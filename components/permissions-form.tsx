"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, ShieldCheck } from "lucide-react";
import { Button, Card, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import {
  CAPABILITY_LABELS,
  CONFIGURABLE_ROLES,
  ROLE_LABELS,
  type Capability,
  type PermissionConfig,
} from "@/lib/auth/types";

const GROUPS: { title: string; caps: Capability[] }[] = [
  { title: "Settings", caps: ["view_settings", "edit_settings"] },
  { title: "Staff", caps: ["view_all_staff", "edit_staff", "view_own"] },
  { title: "Performance", caps: ["edit_appraisals", "edit_notes"] },
  { title: "Operations", caps: ["run_kpi", "run_allowance"] },
  { title: "Accounts", caps: ["manage_users"] },
];

export function PermissionsForm({ initial }: { initial: PermissionConfig }) {
  const router = useRouter();
  const toast = useToast();
  const [cfg, setCfg] = useState<PermissionConfig>(() => structuredClone(initial));
  const [busy, setBusy] = useState(false);

  function toggle(role: (typeof CONFIGURABLE_ROLES)[number], cap: Capability) {
    setCfg((c) => {
      const has = c[role].includes(cap);
      return { ...c, [role]: has ? c[role].filter((x) => x !== cap) : [...c[role], cap] };
    });
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Save failed");
      }
      toast.success("Permissions saved.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <ShieldCheck className="h-5 w-5 text-indigo-500" /> Permissions
        </h1>
        <Button onClick={save} disabled={busy}>
          {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save
        </Button>
      </div>
      <p className="text-sm text-gray-500">
        Choose which capabilities each role has. Super Admin always has full access and cannot be
        changed.
      </p>

      <Card className="overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Capability</th>
              {CONFIGURABLE_ROLES.map((r) => (
                <th key={r} className="px-4 py-2 text-center">
                  {ROLE_LABELS[r]}
                </th>
              ))}
              <th className="px-4 py-2 text-center text-gray-400">{ROLE_LABELS.super_admin}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {GROUPS.map((group) => (
              <GroupRows key={group.title} group={group} cfg={cfg} onToggle={toggle} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function GroupRows({
  group,
  cfg,
  onToggle,
}: {
  group: { title: string; caps: Capability[] };
  cfg: PermissionConfig;
  onToggle: (role: (typeof CONFIGURABLE_ROLES)[number], cap: Capability) => void;
}) {
  return (
    <>
      <tr className="bg-gray-50/60">
        <td
          colSpan={CONFIGURABLE_ROLES.length + 2}
          className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500"
        >
          {group.title}
        </td>
      </tr>
      {group.caps.map((cap) => (
        <tr key={cap}>
          <td className="px-4 py-2 text-gray-700">{CAPABILITY_LABELS[cap]}</td>
          {CONFIGURABLE_ROLES.map((role) => (
            <td key={role} className="px-4 py-2 text-center">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={cfg[role].includes(cap)}
                onChange={() => onToggle(role, cap)}
              />
            </td>
          ))}
          <td className="px-4 py-2 text-center">
            <input type="checkbox" className="h-4 w-4 accent-gray-300" checked disabled />
          </td>
        </tr>
      ))}
    </>
  );
}
