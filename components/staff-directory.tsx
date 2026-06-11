"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Save, UserPlus, Users, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { CenterSelect } from "@/components/center-select";
import { MergeEmployeeButton } from "@/components/merge-employee-button";
import { EmptyState } from "@/components/empty-state";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { useToast } from "@/components/toast";
import { SortTh, TableToolbar, includesText, useTableSort } from "@/components/table-controls";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";
import { jobRoleForTier } from "@/lib/allowance/tier-rules";
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
  allowanceTier: AllowanceTier | null;
  active: boolean;
}

/** Unsaved edits for one employee (centers, type, tier, active). */
interface RowDraft {
  centers: [string, string, string];
  employmentType: EmploymentType;
  tier: AllowanceTier | "";
  active: boolean;
}

function draftFor(e: EmployeeRow): RowDraft {
  const c = splitCenters(e.center);
  return {
    centers: [c[0] ?? "", c[1] ?? "", c[2] ?? ""],
    employmentType: e.employmentType,
    tier: e.allowanceTier ?? "",
    active: e.active,
  };
}

function joinCenters(centers: readonly string[]): string {
  return centers
    .map((c) => c.trim())
    .filter(Boolean)
    .join(", ");
}

function isDirty(e: EmployeeRow, d: RowDraft): boolean {
  return (
    joinCenters(d.centers) !== splitCenters(e.center).join(", ") ||
    d.employmentType !== e.employmentType ||
    (d.tier || null) !== e.allowanceTier ||
    d.active !== e.active
  );
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
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");

  // All row edit state lives HERE (not in the per-employee rows): each employee
  // renders twice (mobile card + desktop row, per responsive-table.tsx), so
  // row-local state would fork between the two mounts. A draft is created on
  // first edit and kept after save — once the refresh lands it matches the
  // server values, so the row simply reads as clean again.
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());

  function setBusy(id: number, on: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function updateDraft(e: EmployeeRow, patch: Partial<RowDraft>) {
    setDrafts((m) => ({ ...m, [e.id]: { ...(m[e.id] ?? draftFor(e)), ...patch } }));
  }

  async function saveRow(e: EmployeeRow) {
    const draft = drafts[e.id] ?? draftFor(e);
    setBusy(e.id, true);
    try {
      const res = await fetch(`/api/coaches/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          center: joinCenters(draft.centers),
          employmentType: draft.employmentType,
          allowanceTier: draft.tier || null,
          active: draft.active,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Save failed");
      }
      toast.success("Saved.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(e.id, false);
    }
  }

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
    tier: (e) => e.allowanceTier ?? "",
    active: (e) => (e.active ? 1 : 0),
  });

  const entryProps = (e: EmployeeRow) => ({
    employee: e,
    centers,
    canEdit,
    draft: drafts[e.id] ?? draftFor(e),
    busy: busyIds.has(e.id),
    onChange: (patch: Partial<RowDraft>) => updateDraft(e, patch),
    onSave: () => void saveRow(e),
    mergeTargets: employees
      .filter((o) => o.id !== e.id)
      .map((o) => ({ id: o.id, name: o.name })),
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
          <EmptyState
            bare
            icon={Users}
            title="No employees yet"
            body={canEdit ? "Use “Add member” above to create one." : undefined}
          />
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

            <MobileCards>
              {sorted.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No employees match the current filters.
                </div>
              ) : (
                sorted.map((e) => <DirectoryEntry key={e.id} layout="card" {...entryProps(e)} />)
              )}
            </MobileCards>
            <DesktopTable>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <SortTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                    <SortTh label="Role" sortKey="jobRole" sort={sort} onSort={toggleSort} />
                    <SortTh label="Type" sortKey="employmentType" sort={sort} onSort={toggleSort} />
                    <SortTh label="Center 1" sortKey="center1" sort={sort} onSort={toggleSort} />
                    <SortTh label="Center 2" sortKey="center2" sort={sort} onSort={toggleSort} />
                    <SortTh label="Center 3" sortKey="center3" sort={sort} onSort={toggleSort} />
                    <SortTh label="Tier" sortKey="tier" sort={sort} onSort={toggleSort} />
                    <SortTh label="Active" sortKey="active" sort={sort} onSort={toggleSort} align="center" />
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                        No employees match the current filters.
                      </td>
                    </tr>
                  ) : (
                    sorted.map((e) => <DirectoryEntry key={e.id} layout="row" {...entryProps(e)} />)
                  )}
                </tbody>
              </table>
            </DesktopTable>
          </>
        )}
      </Card>
    </div>
  );
}

/** Purely presentational — edit state and the PATCH live in StaffDirectory. */
function DirectoryEntry({
  employee,
  layout,
  centers,
  canEdit,
  mergeTargets,
  draft,
  busy,
  onChange,
  onSave,
}: {
  employee: EmployeeRow;
  layout: "card" | "row";
  centers: string[];
  canEdit: boolean;
  mergeTargets: { id: number; name: string }[];
  draft: RowDraft;
  busy: boolean;
  onChange: (patch: Partial<RowDraft>) => void;
  onSave: () => void;
}) {
  // Rule: the role is derived from the pay tier (A1/A2/A3 → front desk, else
  // instructor) and is not editable — change the tier and the role follows.
  const derivedRole = jobRoleForTier(draft.tier || null);
  const dirty = isDirty(employee, draft);

  function setCenter(i: number, value: string) {
    onChange({
      centers: draft.centers.map((c, idx) => (idx === i ? value : c)) as RowDraft["centers"],
    });
  }

  const employmentSelect = (className: string) => (
    <Select
      className={className}
      value={draft.employmentType}
      onChange={(e) => onChange({ employmentType: e.target.value as EmploymentType })}
    >
      {EMPLOYMENT_TYPES.map((t) => (
        <option key={t} value={t}>
          {EMPLOYMENT_TYPE_LABELS[t]}
        </option>
      ))}
    </Select>
  );
  const tierSelect = (className: string) => (
    <Select
      className={className}
      value={draft.tier}
      onChange={(e) => onChange({ tier: e.target.value as AllowanceTier | "" })}
    >
      <option value="">—</option>
      {ALLOWANCE_TIERS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </Select>
  );

  if (layout === "card") {
    return (
      <div className={cn("p-4", !draft.active && "bg-gray-50/60 opacity-60")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/staff/${employee.id}`}
              className="font-semibold text-indigo-700 hover:underline"
            >
              {employee.name}
            </Link>
            <div className="mt-0.5 text-[11px] text-gray-400">
              {EMPLOYEE_ROLE_LABELS[derivedRole]}
              <span className="ml-1 text-gray-300">· from pay tier</span>
            </div>
          </div>
          {canEdit ? (
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-gray-600">
              Active
              <input
                type="checkbox"
                className="h-5 w-5 accent-indigo-600"
                checked={draft.active}
                onChange={(e) => onChange({ active: e.target.checked })}
              />
            </label>
          ) : (
            <span
              className={cn(
                "shrink-0 text-xs font-medium",
                draft.active ? "text-green-600" : "text-gray-400",
              )}
            >
              {draft.active ? "Active" : "Inactive"}
            </span>
          )}
        </div>

        {canEdit ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-overline text-muted">Employment</span>
                {employmentSelect("mt-1")}
              </label>
              <label className="block">
                <span className="text-overline text-muted">Pay tier</span>
                {tierSelect("mt-1")}
              </label>
              {[0, 1, 2].map((i) => (
                <label key={i} className="block">
                  <span className="text-overline text-muted">Center {i + 1}</span>
                  <CenterSelect
                    className="mt-1"
                    centers={centers}
                    value={draft.centers[i]}
                    placeholder={i === 0 ? "Center" : "—"}
                    onChange={(v) => setCenter(i, v)}
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button className="min-h-11 flex-1" onClick={onSave} disabled={busy || !dirty}>
                {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save
              </Button>
              <MergeEmployeeButton
                variant="button"
                employee={{ id: employee.id, name: employee.name }}
                others={mergeTargets}
              />
              <Link
                href={`/staff/${employee.id}`}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 active:bg-gray-100"
              >
                Profile <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mt-2 text-sm text-gray-700">
              {EMPLOYMENT_TYPE_LABELS[employee.employmentType]}
              <span> · Tier {employee.allowanceTier ?? "—"}</span>
            </div>
            <div className="mt-0.5 text-sm text-gray-500">
              {joinCenters(draft.centers) || "—"}
            </div>
            <Link
              href={`/staff/${employee.id}`}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 active:bg-gray-100"
            >
              Profile <ChevronRight className="h-4 w-4" />
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <tr className={cn(!draft.active && "bg-gray-50/60 opacity-60")}>
      <td className="px-4 py-2 font-medium">
        <Link href={`/staff/${employee.id}`} className="text-indigo-700 hover:underline">
          {employee.name}
        </Link>
      </td>
      <td className="px-4 py-2 text-gray-700" title="Set by the pay tier (A1/A2/A3 → Front Desk)">
        {EMPLOYEE_ROLE_LABELS[derivedRole]}
      </td>
      <td className="px-4 py-1.5">
        {canEdit ? (
          employmentSelect("w-28 py-1 text-xs")
        ) : (
          <span className="text-gray-700">{EMPLOYMENT_TYPE_LABELS[employee.employmentType]}</span>
        )}
      </td>
      {[0, 1, 2].map((i) =>
        canEdit ? (
          <td key={i} className="px-4 py-1.5">
            <CenterSelect
              className="w-28 py-1 text-xs"
              centers={centers}
              value={draft.centers[i]}
              placeholder={i === 0 ? "Center" : "—"}
              onChange={(v) => setCenter(i, v)}
            />
          </td>
        ) : (
          <td key={i} className="px-4 py-2 text-gray-700">
            {draft.centers[i] || "—"}
          </td>
        ),
      )}
      <td className="px-4 py-1.5">
        {canEdit ? (
          tierSelect("w-20 py-1 text-xs")
        ) : (
          <span className="text-gray-700">{employee.allowanceTier ?? "—"}</span>
        )}
      </td>
      <td className="px-4 py-2 text-center">
        {canEdit ? (
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-600"
            checked={draft.active}
            onChange={(e) => onChange({ active: e.target.checked })}
            title={draft.active ? "Active" : "Inactive"}
          />
        ) : draft.active ? (
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
              onClick={onSave}
              disabled={busy || !dirty}
            >
              {busy ? <Spinner /> : <Save className="h-3.5 w-3.5" />} Save
            </Button>
          )}
          {canEdit && (
            <MergeEmployeeButton
              employee={{ id: employee.id, name: employee.name }}
              others={mergeTargets}
            />
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
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("full_time");
  const [center, setCenter] = useState("");
  const [tier, setTier] = useState<AllowanceTier | "">("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setEmploymentType("full_time");
    setCenter("");
    setTier("");
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Name required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalName: name.trim(),
          employmentType,
          center: center.trim(),
          allowanceTier: tier || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Create failed");
      }
      toast.success("Employee created.");
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Add member
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <UserPlus className="h-4 w-4 text-indigo-500" /> Add member
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
          <div className="mt-1 flex h-[38px] items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
            {EMPLOYEE_ROLE_LABELS[jobRoleForTier(tier || null)]}
            <span className="text-xs text-gray-400">· from pay tier</span>
          </div>
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
      <div className="mt-3 flex items-center gap-2">
        <Button onClick={submit} disabled={busy || !name.trim()}>
          {busy ? <Spinner /> : <Plus className="h-4 w-4" />} Create
        </Button>
      </div>
    </Card>
  );
}
