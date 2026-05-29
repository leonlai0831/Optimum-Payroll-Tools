"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Save, UserPlus, Users, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { CenterSelect } from "@/components/center-select";
import { useToast } from "@/components/toast";
import { SortTh, TableToolbar, includesText, useTableSort } from "@/components/table-controls";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  type EmployeeRole,
  type EmploymentType,
} from "@/lib/performance/types";
import { cn, splitCenters } from "@/lib/utils";

export interface EmployeeRow {
  id: number;
  name: string;
  jobRole: EmployeeRole;
  employmentType: EmploymentType;
  center: string;
  active: boolean;
}

export function StaffDirectory({
  employees,
  centers,
  canEdit,
}: {
  employees: EmployeeRow[];
  centers: string[];
  canEdit: boolean;
}) {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");

  const filtered = useMemo(
    () =>
      employees.filter((e) => {
        if (!includesText(e.name, q)) return false;
        if (roleFilter && e.jobRole !== roleFilter) return false;
        if (typeFilter && e.employmentType !== typeFilter) return false;
        if (activeFilter === "active" && !e.active) return false;
        if (activeFilter === "inactive" && e.active) return false;
        return true;
      }),
    [employees, q, roleFilter, typeFilter, activeFilter],
  );

  const { sorted, sort, toggleSort } = useTableSort(filtered, {
    name: (e) => e.name,
    jobRole: (e) => e.jobRole,
    employmentType: (e) => e.employmentType,
    center1: (e) => splitCenters(e.center)[0] ?? "",
    center2: (e) => splitCenters(e.center)[1] ?? "",
    center3: (e) => splitCenters(e.center)[2] ?? "",
    active: (e) => (e.active ? 1 : 0),
  });

  return (
    <div className="space-y-4">
      {canEdit && <AddEmployee centers={centers} />}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
          <Users className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-bold text-gray-900">Directory</span>
          <span className="text-xs text-gray-500">{employees.length} total</span>
        </div>

        {employees.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">
            No employees yet.{canEdit ? " Use “Add employee” above to create one." : ""}
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
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-auto py-1.5 text-xs"
              >
                <option value="">All roles</option>
                {EMPLOYEE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {EMPLOYEE_ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-auto py-1.5 text-xs"
              >
                <option value="">All types</option>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EMPLOYMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
              <Select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as "all" | "active" | "inactive")}
                className="w-auto py-1.5 text-xs"
              >
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
                <option value="all">All</option>
              </Select>
              <span className="ml-auto text-xs text-gray-500">
                {sorted.length} of {employees.length}
              </span>
            </TableToolbar>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <SortTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                    <SortTh label="Role" sortKey="jobRole" sort={sort} onSort={toggleSort} />
                    <SortTh label="Type" sortKey="employmentType" sort={sort} onSort={toggleSort} />
                    <SortTh label="Center 1" sortKey="center1" sort={sort} onSort={toggleSort} />
                    <SortTh label="Center 2" sortKey="center2" sort={sort} onSort={toggleSort} />
                    <SortTh label="Center 3" sortKey="center3" sort={sort} onSort={toggleSort} />
                    <SortTh label="Active" sortKey="active" sort={sort} onSort={toggleSort} align="center" />
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                        No employees match the current filters.
                      </td>
                    </tr>
                  ) : (
                    sorted.map((e) => (
                      <DirectoryRow
                        key={`${e.id}-${e.center}`}
                        employee={e}
                        centers={centers}
                        canEdit={canEdit}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function DirectoryRow({
  employee,
  centers,
  canEdit,
}: {
  employee: EmployeeRow;
  centers: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const initial = splitCenters(employee.center);
  const [rowCenters, setRowCenters] = useState<string[]>([
    initial[0] ?? "",
    initial[1] ?? "",
    initial[2] ?? "",
  ]);
  const [busy, setBusy] = useState(false);

  const joinedCenters = rowCenters
    .map((c) => c.trim())
    .filter(Boolean)
    .join(", ");
  const dirty = joinedCenters !== splitCenters(employee.center).join(", ");

  function setCenter(i: number, value: string) {
    setRowCenters((prev) => prev.map((c, idx) => (idx === i ? value : c)));
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/coaches/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ center: joinedCenters }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Save failed");
      }
      toast.success("Centers updated.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className={cn(!employee.active && "bg-gray-50/60 opacity-60")}>
      <td className="px-4 py-2 font-medium">
        <Link href={`/staff/${employee.id}`} className="text-indigo-700 hover:underline">
          {employee.name}
        </Link>
      </td>
      <td className="px-4 py-2 text-gray-700">{EMPLOYEE_ROLE_LABELS[employee.jobRole]}</td>
      <td className="px-4 py-2 text-gray-700">{EMPLOYMENT_TYPE_LABELS[employee.employmentType]}</td>
      {[0, 1, 2].map((i) =>
        canEdit ? (
          <td key={i} className="px-4 py-1.5">
            <CenterSelect
              className="w-28 py-1 text-xs"
              centers={centers}
              value={rowCenters[i]}
              placeholder={i === 0 ? "Center" : "—"}
              onChange={(v) => setCenter(i, v)}
            />
          </td>
        ) : (
          <td key={i} className="px-4 py-2 text-gray-700">
            {rowCenters[i] || "—"}
          </td>
        ),
      )}
      <td className="px-4 py-2 text-center">
        {employee.active ? (
          <span className="text-green-600">●</span>
        ) : (
          <span className="text-gray-300">●</span>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-2">
          {canEdit && (
            <Button
              variant="outline"
              className="px-2 py-1 text-xs"
              onClick={save}
              disabled={busy || !dirty}
            >
              {busy ? <Spinner /> : <Save className="h-3.5 w-3.5" />} Save
            </Button>
          )}
          <Link
            href={`/staff/${employee.id}`}
            className="inline-flex items-center text-gray-400 hover:text-indigo-600"
            title="Open profile"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </td>
    </tr>
  );
}

function AddEmployee({ centers }: { centers: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [jobRole, setJobRole] = useState<EmployeeRole>("instructor");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("full_time");
  const [center, setCenter] = useState("");
  const [tier, setTier] = useState<AllowanceTier | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setName("");
    setJobRole("instructor");
    setEmploymentType("full_time");
    setCenter("");
    setTier("");
    setError("");
  }

  async function submit() {
    if (!name.trim()) {
      setError("Name required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalName: name.trim(),
          jobRole,
          employmentType,
          center: center.trim(),
          allowanceTier: tier || null,
        }),
      });
      if (!res.ok) throw new Error("Create failed");
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError("Create failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Add employee
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <UserPlus className="h-4 w-4 text-indigo-500" /> Add employee
        </h3>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-gray-400 hover:text-gray-600"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="emp-name">Name</Label>
          <Input
            id="emp-name"
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </div>
        <div>
          <Label htmlFor="emp-role">Role</Label>
          <Select
            id="emp-role"
            className="mt-1"
            value={jobRole}
            onChange={(e) => setJobRole(e.target.value as EmployeeRole)}
          >
            {EMPLOYEE_ROLES.map((r) => (
              <option key={r} value={r}>
                {EMPLOYEE_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="emp-type">Employment</Label>
          <Select
            id="emp-type"
            className="mt-1"
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
          >
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="emp-center">Center</Label>
          <CenterSelect id="emp-center" className="mt-1" centers={centers} value={center} onChange={setCenter} />
        </div>
        <div>
          <Label htmlFor="emp-tier">Pay tier (optional)</Label>
          <Select
            id="emp-tier"
            className="mt-1"
            value={tier}
            onChange={(e) => setTier(e.target.value as AllowanceTier | "")}
          >
            <option value="">—</option>
            {ALLOWANCE_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <Button onClick={submit} disabled={busy || !name.trim()}>
          {busy ? <Spinner /> : <Plus className="h-4 w-4" />} Create
        </Button>
      </div>
    </Card>
  );
}
