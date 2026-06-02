"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Save, Trash2, UserPlus, X } from "lucide-react";
import { Badge, Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
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

export function GymStaffRoster({ staff, canEdit }: { staff: GymStaffRecord[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

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

      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-overline text-muted">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Position</th>
              <th className="px-3 py-2">Employment</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Status</th>
              {canEdit && <th className="px-3 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {staff.map((m) => (
              <tr key={m.id} className={m.active ? "" : "opacity-50"}>
                <td className="px-3 py-2 font-medium text-gray-900">{m.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">{m.staffCode || "—"}</td>
                <td className="px-3 py-2 text-gray-700">{gymPositionLabel(m.position)}</td>
                <td className="px-3 py-2">
                  <Badge className={m.employmentType === "freelancer" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50 text-gray-600"}>
                    {gymEmploymentLabel(m.employmentType)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {m.email || m.phone ? (
                    <span>{[m.email, m.phone].filter(Boolean).join(" · ")}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{m.active ? <span className="text-green-700">Active</span> : <span className="text-gray-400">Inactive</span>}</td>
                {canEdit && (
                  <td className="px-3 py-2">
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
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="px-3 py-8 text-center text-gray-400">
                  No gym staff yet.{canEdit ? " Add the first member above." : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
