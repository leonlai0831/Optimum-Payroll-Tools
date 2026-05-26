"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Save, Trash2, Users } from "lucide-react";
import { Button, Card, Input, Select, Spinner } from "@/components/ui";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";
import { SortTh, TableToolbar, includesText, useTableSort } from "@/components/table-controls";
import { cn } from "@/lib/utils";

export interface StaffMember {
  id: number;
  name: string;
  center: string;
  position: AllowanceTier | null;
  active: boolean;
}

/** Centers are stored as one comma-joined string; the UI edits them as up to 3 slots. */
function splitCenters(center: string): string[] {
  return center
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export function StaffListManager({ staff }: { staff: StaffMember[] }) {
  const [q, setQ] = useState("");
  const [centerFilter, setCenterFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const centerOptions = useMemo(
    () => [...new Set(staff.flatMap((s) => splitCenters(s.center)))].sort(),
    [staff],
  );
  const positionOptions = useMemo(
    () => [...new Set(staff.map((s) => s.position).filter((p): p is AllowanceTier => !!p))].sort(),
    [staff],
  );

  const filtered = useMemo(
    () =>
      staff.filter((s) => {
        if (!includesText(s.name, q)) return false;
        if (centerFilter && !splitCenters(s.center).includes(centerFilter)) return false;
        if (positionFilter && s.position !== positionFilter) return false;
        if (activeFilter === "active" && !s.active) return false;
        if (activeFilter === "inactive" && s.active) return false;
        return true;
      }),
    [staff, q, centerFilter, positionFilter, activeFilter],
  );

  const { sorted, sort, toggleSort } = useTableSort(filtered, {
    name: (s) => s.name,
    center1: (s) => splitCenters(s.center)[0] ?? "",
    center2: (s) => splitCenters(s.center)[1] ?? "",
    center3: (s) => splitCenters(s.center)[2] ?? "",
    position: (s) => s.position ?? "",
    active: (s) => (s.active ? 1 : 0),
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <Users className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-bold text-gray-900">Staff List</span>
        <span className="text-xs text-gray-500">
          {staff.length} total · change position, transfer center (up to 3), or mark resigned
          (inactive)
        </span>
      </div>

      {staff.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">
          No staff yet. Profiles are created when you save an allowance for someone on the
          Calculator.
        </p>
      ) : (
        <>
          <TableToolbar>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name…"
              className="w-44 py-1.5 text-xs"
            />
            <Select
              value={centerFilter}
              onChange={(e) => setCenterFilter(e.target.value)}
              className="w-auto py-1.5 text-xs"
            >
              <option value="">All centers</option>
              {centerOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="w-auto py-1.5 text-xs"
            >
              <option value="">All positions</option>
              {positionOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as "all" | "active" | "inactive")}
              className="w-auto py-1.5 text-xs"
            >
              <option value="all">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Resigned only</option>
            </Select>
            <span className="ml-auto text-xs text-gray-500">
              {sorted.length} of {staff.length}
            </span>
          </TableToolbar>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <SortTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                  <SortTh label="Center 1" sortKey="center1" sort={sort} onSort={toggleSort} />
                  <SortTh label="Center 2" sortKey="center2" sort={sort} onSort={toggleSort} />
                  <SortTh label="Center 3" sortKey="center3" sort={sort} onSort={toggleSort} />
                  <SortTh label="Position" sortKey="position" sort={sort} onSort={toggleSort} />
                  <SortTh label="Active" sortKey="active" sort={sort} onSort={toggleSort} align="center" />
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                      No staff match the current filters.
                    </td>
                  </tr>
                ) : (
                  sorted.map((s) => <StaffRow key={s.id} member={s} />)
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function StaffRow({ member }: { member: StaffMember }) {
  const router = useRouter();
  const initialCenters = splitCenters(member.center);
  const [name, setName] = useState(member.name);
  const [centers, setCenters] = useState<string[]>([
    initialCenters[0] ?? "",
    initialCenters[1] ?? "",
    initialCenters[2] ?? "",
  ]);
  const [position, setPosition] = useState<AllowanceTier | "">(member.position ?? "");
  const [active, setActive] = useState(member.active);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const joinedCenters = centers
    .map((c) => c.trim())
    .filter(Boolean)
    .join(", ");
  const normalizedOriginal = splitCenters(member.center).join(", ");

  const dirty =
    name.trim() !== member.name ||
    joinedCenters !== normalizedOriginal ||
    (position || null) !== (member.position ?? null) ||
    active !== member.active;

  function touch() {
    setSaved(false);
    setError("");
  }

  function setCenter(i: number, value: string) {
    setCenters((prev) => prev.map((c, idx) => (idx === i ? value : c)));
    touch();
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
          center: joinedCenters,
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
      {[0, 1, 2].map((i) => (
        <td key={i} className="px-4 py-1.5">
          <Input
            className="w-24 py-1 text-xs"
            value={centers[i]}
            placeholder={i === 0 ? "Center" : "—"}
            onChange={(e) => setCenter(i, e.target.value)}
          />
        </td>
      ))}
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
