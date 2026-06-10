"use client";

import { useImperativeHandle, useMemo, useState, type Ref } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Save, Trash2, UserPlus, Users, X } from "lucide-react";
import { Badge, Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { EmptyState } from "@/components/empty-state";
import { SortTh, TableToolbar, includesText, useTableSort } from "@/components/table-controls";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { cn } from "@/lib/utils";
import {
  GYM_EMPLOYMENT_TYPES,
  GYM_POSITIONS,
  gymEmploymentLabel,
  gymPositionLabel,
  type GymEmploymentType,
  type GymPosition,
} from "@/lib/gym/types";
import type { GymStaffRecord } from "@/lib/db/schema";

type FormState = {
  name: string;
  staffCode: string;
  position: GymPosition;
  employmentType: GymEmploymentType;
  email: string;
  phone: string;
  aliasesText: string;
  active: boolean;
};

const EMPTY: FormState = {
  name: "",
  staffCode: "",
  position: "personal_trainer",
  employmentType: "full_time",
  email: "",
  phone: "",
  aliasesText: "",
  active: true,
};

/** Imperative handle so a sibling (the unmatched-earner rows) can pre-fill the add form. */
export type StaffRosterHandle = { prefillAdd: (p: { name: string; staffCode: string }) => void };

export function GymStaffRoster({
  staff,
  canEdit,
  ref,
}: {
  staff: GymStaffRecord[];
  canEdit: boolean;
  ref?: Ref<StaffRosterHandle>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  // Let an unmatched-earner row pre-fill the *add* form (same scroll-to-top + focus as edit).
  useImperativeHandle(ref, () => ({
    prefillAdd: ({ name, staffCode }) => {
      setEditingId(null);
      setForm({ ...EMPTY, name, staffCode });
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
        requestAnimationFrame(() => document.getElementById("gs-name")?.focus());
      }
    },
  }), []);

  // Directory search / filter / sort (mirrors the Swim School staff directory).
  const [q, setQ] = useState("");
  const [posFilter, setPosFilter] = useState("");
  const [empFilter, setEmpFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");

  const filtered = useMemo(
    () =>
      staff.filter((m) => {
        if (!includesText(m.name, q) && !includesText(m.staffCode, q)) return false;
        if (posFilter && m.position !== posFilter) return false;
        if (empFilter && m.employmentType !== empFilter) return false;
        if (activeFilter === "active" && !m.active) return false;
        if (activeFilter === "inactive" && m.active) return false;
        return true;
      }),
    [staff, q, posFilter, empFilter, activeFilter],
  );
  const { sorted, sort, toggleSort } = useTableSort(filtered, {
    name: (m) => m.name,
    staffCode: (m) => m.staffCode,
    position: (m) => gymPositionLabel(m.position),
    employmentType: (m) => gymEmploymentLabel(m.employmentType),
    active: (m) => (m.active ? 1 : 0),
  });

  function startEdit(m: GymStaffRecord) {
    setEditingId(m.id);
    setForm({
      name: m.name,
      staffCode: m.staffCode,
      position: m.position,
      employmentType: m.employmentType,
      email: m.email,
      phone: m.phone,
      aliasesText: (m.aliases ?? []).join(", "),
      active: m.active,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Name is required.");
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        staffCode: form.staffCode,
        position: form.position,
        employmentType: form.employmentType,
        email: form.email,
        phone: form.phone,
        aliases: form.aliasesText.split(",").map((a) => a.trim()).filter(Boolean),
        active: form.active,
      };
      const res = await fetch(editingId ? `/api/gym/staff/${editingId}` : "/api/gym/staff", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      toast.success(editingId ? "Staff updated." : "Staff added.");
      resetForm();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(m: GymStaffRecord) {
    if (!confirm(`Delete ${m.name}? This cannot be undone.`)) return;
    setRemoving(m.id);
    try {
      const res = await fetch(`/api/gym/staff/${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Staff deleted.");
      if (editingId === m.id) resetForm();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
            {editingId ? <Pencil className="h-4 w-4 text-brand" /> : <UserPlus className="h-4 w-4 text-brand" />}
            {editingId ? "Edit gym staff" : "Add gym staff"}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="gs-name">Name</Label>
              <Input id="gs-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="gs-code">Staff code (commission)</Label>
              <Input id="gs-code" value={form.staffCode} onChange={(e) => setForm({ ...form, staffCode: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="gs-pos">Position</Label>
              <Select id="gs-pos" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value as GymPosition })} className="mt-1">
                {GYM_POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="gs-emp">Employment type</Label>
              <Select id="gs-emp" value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value as GymEmploymentType })} className="mt-1">
                {GYM_EMPLOYMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="gs-email">Email</Label>
              <Input id="gs-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="gs-phone">Phone</Label>
              <Input id="gs-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
            </div>
            <div className="lg:col-span-2">
              <Label htmlFor="gs-alias">Name aliases (comma-separated, for coaching match)</Label>
              <Input id="gs-alias" value={form.aliasesText} onChange={(e) => setForm({ ...form, aliasesText: e.target.value })} placeholder="Kah Hui Fong, K. H. Fong" className="mt-1" />
            </div>
            <label className="flex items-center gap-2 self-end text-sm text-gray-700">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Spinner /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Save changes" : "Add staff"}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={resetForm} disabled={saving}>
                <X className="h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
          <Users className="h-4 w-4 text-brand" />
          <span className="text-sm font-bold text-gray-900">Directory</span>
          <span className="text-xs text-gray-500">{staff.length} total</span>
        </div>

        {staff.length === 0 ? (
          <EmptyState
            bare
            icon={Users}
            title="No gym staff yet"
            body={canEdit ? "Add the first member above." : undefined}
          />
        ) : (
          <>
            <TableToolbar>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or code…"
                className="w-48 py-1.5 text-xs"
              />
              <Select value={posFilter} onChange={(e) => setPosFilter(e.target.value)} className="w-auto py-1.5 text-xs">
                <option value="">All positions</option>
                {GYM_POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
              <Select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className="w-auto py-1.5 text-xs">
                <option value="">All types</option>
                {GYM_EMPLOYMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
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
                {sorted.length} of {staff.length}
              </span>
            </TableToolbar>

            <MobileCards>
              {sorted.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No staff match the current filters.
                </div>
              ) : (
                sorted.map((m) => (
                  <div key={m.id} className={cn("p-4", !m.active && "bg-gray-50/60 opacity-60")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/commission/staff/${m.id}`}
                            className="truncate font-semibold text-gray-900 hover:text-brand"
                          >
                            {m.name}
                          </Link>
                          {!m.active && (
                            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-400">
                          {gymPositionLabel(m.position)}
                          {m.staffCode && <span className="ml-1 font-mono">· {m.staffCode}</span>}
                        </div>
                        {(m.email || m.phone) && (
                          <div className="mt-0.5 truncate text-[11px] text-gray-400">
                            {[m.email, m.phone].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <Badge
                        className={
                          m.employmentType === "freelancer"
                            ? "shrink-0 border-amber-200 bg-amber-50 text-amber-700"
                            : "shrink-0 border-gray-200 bg-gray-50 text-gray-600"
                        }
                      >
                        {gymEmploymentLabel(m.employmentType)}
                      </Badge>
                    </div>
                    {canEdit && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => startEdit(m)}
                          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 text-sm font-medium text-brand hover:bg-brand/5 active:bg-brand/10"
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </button>
                        <button
                          onClick={() => remove(m)}
                          disabled={removing === m.id}
                          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-50"
                        >
                          {removing === m.id ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </MobileCards>

            <DesktopTable>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <SortTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                    <SortTh label="Code" sortKey="staffCode" sort={sort} onSort={toggleSort} />
                    <SortTh label="Position" sortKey="position" sort={sort} onSort={toggleSort} />
                    <SortTh label="Employment" sortKey="employmentType" sort={sort} onSort={toggleSort} />
                    <th className="px-4 py-2 text-left">Contact</th>
                    <SortTh label="Status" sortKey="active" sort={sort} onSort={toggleSort} align="center" />
                    {canEdit && <th className="px-4 py-2 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                        No staff match the current filters.
                      </td>
                    </tr>
                  ) : (
                    sorted.map((m) => (
                      <tr key={m.id} className={m.active ? "" : "bg-gray-50/60 opacity-60"}>
                        <td className="px-4 py-2 font-medium">
                          <Link href={`/commission/staff/${m.id}`} className="text-gray-900 hover:text-brand hover:underline">
                            {m.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{m.staffCode || "—"}</td>
                        <td className="px-4 py-2 text-gray-700">{gymPositionLabel(m.position)}</td>
                        <td className="px-4 py-2">
                          <Badge className={m.employmentType === "freelancer" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50 text-gray-600"}>
                            {gymEmploymentLabel(m.employmentType)}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {m.email || m.phone ? <span>{[m.email, m.phone].filter(Boolean).join(" · ")}</span> : "—"}
                        </td>
                        <td className="px-4 py-2 text-center text-xs">
                          {m.active ? (
                            <span className="text-green-600" title="Active">●</span>
                          ) : (
                            <span className="text-gray-300" title="Inactive">●</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => startEdit(m)} title="Edit" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={() => remove(m)} disabled={removing === m.id} title="Delete" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50">
                                {removing === m.id ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
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
