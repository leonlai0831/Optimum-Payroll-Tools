"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { ConfirmModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import {
  GYM_EMPLOYMENT_TYPES,
  GYM_POSITIONS,
  type GymEmploymentType,
  type GymPosition,
} from "@/lib/gym/types";
import type { GymStaffRecord } from "@/lib/db/schema";

/**
 * Editable identity card on a gym-staff profile — mirrors the Swim School
 * coach DetailsCard (fieldset gated by canEdit, Save when dirty, Delete with
 * confirm). Writes via PUT/DELETE /api/gym/staff/[id] (which audit-log the change).
 */
export function GymStaffDetailsCard({ member, canEdit }: { member: GymStaffRecord; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(member.name);
  const [staffCode, setStaffCode] = useState(member.staffCode);
  const [position, setPosition] = useState<GymPosition>(member.position);
  const [employmentType, setEmploymentType] = useState<GymEmploymentType>(member.employmentType);
  const [email, setEmail] = useState(member.email);
  const [phone, setPhone] = useState(member.phone);
  const [aliasesText, setAliasesText] = useState((member.aliases ?? []).join(", "));
  const [active, setActive] = useState(member.active);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const aliases = aliasesText.split(",").map((a) => a.trim()).filter(Boolean);
  const dirty =
    name.trim() !== member.name ||
    staffCode.trim() !== member.staffCode ||
    position !== member.position ||
    employmentType !== member.employmentType ||
    email.trim() !== member.email ||
    phone.trim() !== member.phone ||
    aliases.join(", ") !== (member.aliases ?? []).join(", ") ||
    active !== member.active;

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/gym/staff/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          staffCode: staffCode.trim(),
          position,
          employmentType,
          email: email.trim(),
          phone: phone.trim(),
          aliases,
          active,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      toast.success("Profile saved.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setConfirmDelete(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/gym/staff/${member.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/commission/staff");
      router.refresh();
    } catch {
      toast.error("Delete failed.");
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-gray-900">Details</h3>
      <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="gp-name">Name</Label>
            <Input id="gp-name" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gp-code">Staff code (commission)</Label>
            <Input id="gp-code" className="mt-1" value={staffCode} onChange={(e) => setStaffCode(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gp-pos">Position</Label>
            <Select id="gp-pos" className="mt-1" value={position} onChange={(e) => setPosition(e.target.value as GymPosition)}>
              {GYM_POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="gp-emp">Employment type</Label>
            <Select id="gp-emp" className="mt-1" value={employmentType} onChange={(e) => setEmploymentType(e.target.value as GymEmploymentType)}>
              {GYM_EMPLOYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="gp-email">Email</Label>
            <Input id="gp-email" className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gp-phone">Phone</Label>
            <Input id="gp-phone" className="mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="lg:col-span-2">
            <Label htmlFor="gp-alias">Name aliases (comma-separated, for coaching match)</Label>
            <Input
              id="gp-alias"
              className="mt-1"
              value={aliasesText}
              onChange={(e) => setAliasesText(e.target.value)}
              placeholder="Kah Hui Fong, K. H. Fong"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>
          </div>
        </div>
      </fieldset>

      {canEdit && (
        <div className="mt-4 flex items-center gap-2">
          <Button onClick={save} disabled={busy || !dirty}>
            {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save
          </Button>
          <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={busy} className="text-red-600">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      )}
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={`Delete ${member.name}?`}
        message="Removes the roster profile. Saved commission/coaching months are kept — this person will reappear under unmatched earners."
        confirmLabel="Delete profile"
        busy={busy}
      />
    </Card>
  );
}
