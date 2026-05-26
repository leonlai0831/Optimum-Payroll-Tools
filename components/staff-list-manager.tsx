"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Save, Trash2, Users } from "lucide-react";
import { Button, Card, Input, Select, Spinner } from "@/components/ui";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";
import { cn } from "@/lib/utils";

export interface StaffMember {
  id: number;
  name: string;
  center: string;
  position: AllowanceTier | null;
  active: boolean;
}

export function StaffListManager({ staff }: { staff: StaffMember[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <Users className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-bold text-gray-900">Staff List</span>
        <span className="text-xs text-gray-500">
          {staff.length} total · change position, transfer center, or mark resigned (inactive)
        </span>
      </div>

      {staff.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">
          No staff yet. Profiles are created when you save an allowance for someone on the Calculator.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Center</th>
                <th className="px-4 py-2 text-left">Position</th>
                <th className="px-4 py-2 text-center">Active</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((s) => (
                <StaffRow key={s.id} member={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function StaffRow({ member }: { member: StaffMember }) {
  const router = useRouter();
  const [name, setName] = useState(member.name);
  const [center, setCenter] = useState(member.center);
  const [position, setPosition] = useState<AllowanceTier | "">(member.position ?? "");
  const [active, setActive] = useState(member.active);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    name.trim() !== member.name ||
    center.trim() !== member.center ||
    (position || null) !== (member.position ?? null) ||
    active !== member.active;

  function touch() {
    setSaved(false);
    setError("");
  }

  async function save() {
    if (!name.trim()) {
      setError("Name required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/coaches/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalName: name.trim(),
          center: center.trim(),
          allowanceTier: position || null,
          active,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      router.refresh();
    } catch {
      setError("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        `Delete ${member.name}? This permanently removes the staff profile (saved allowance records are kept).`,
      )
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/coaches/${member.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className={cn(!active && "bg-gray-50/60 opacity-60")}>
      <td className="px-4 py-1.5">
        <Input
          className="py-1 text-xs"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            touch();
          }}
        />
      </td>
      <td className="px-4 py-1.5">
        <Input
          className="py-1 text-xs"
          value={center}
          onChange={(e) => {
            setCenter(e.target.value);
            touch();
          }}
        />
      </td>
      <td className="px-4 py-1.5">
        <Select
          className="py-1 text-xs"
          value={position}
          onChange={(e) => {
            setPosition(e.target.value as AllowanceTier | "");
            touch();
          }}
        >
          <option value="">—</option>
          {ALLOWANCE_TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-4 py-1.5 text-center">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => {
            setActive(e.target.checked);
            touch();
          }}
          className="h-4 w-4 accent-indigo-600"
          title={active ? "Active" : "Resigned / inactive"}
        />
      </td>
      <td className="px-4 py-1.5">
        <div className="flex items-center justify-end gap-2">
          {error && <span className="text-[11px] text-red-600">{error}</span>}
          <Button
            variant="outline"
            className="px-2 py-1 text-xs"
            onClick={save}
            disabled={busy || !dirty}
          >
            {busy ? (
              <Spinner />
            ) : saved && !dirty ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saved && !dirty ? "Saved" : "Save"}
          </Button>
          <button
            className="text-gray-300 transition hover:text-red-500 disabled:opacity-40"
            onClick={remove}
            disabled={busy}
            title="Delete staff"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
