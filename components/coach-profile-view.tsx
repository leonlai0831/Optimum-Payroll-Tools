"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Save, Trash2 } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { CenterSelect } from "@/components/center-select";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  type EmployeeRole,
  type EmploymentType,
} from "@/lib/performance/types";

export interface CoachProfile {
  id: number;
  name: string;
  jobRole: EmployeeRole;
  employmentType: EmploymentType;
  center: string;
  active: boolean;
  allowanceTier: AllowanceTier | null;
}

export function CoachProfileView({
  coach,
  centers,
  canEdit,
  backHref,
}: {
  coach: CoachProfile;
  centers: string[];
  canEdit: boolean;
  backHref?: string;
}) {
  return (
    <div className="space-y-4">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" /> Directory
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{coach.name}</h1>
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
          {EMPLOYEE_ROLE_LABELS[coach.jobRole]}
        </span>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
          {EMPLOYMENT_TYPE_LABELS[coach.employmentType]}
        </span>
        {!coach.active && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
            Inactive
          </span>
        )}
      </div>

      <DetailsCard coach={coach} centers={centers} canEdit={canEdit} />
    </div>
  );
}

function DetailsCard({
  coach,
  centers,
  canEdit,
}: {
  coach: CoachProfile;
  centers: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(coach.name);
  const [jobRole, setJobRole] = useState<EmployeeRole>(coach.jobRole);
  const [employmentType, setEmploymentType] = useState<EmploymentType>(coach.employmentType);
  const [center, setCenter] = useState(coach.center);
  const [tier, setTier] = useState<AllowanceTier | "">(coach.allowanceTier ?? "");
  const [active, setActive] = useState(coach.active);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    name.trim() !== coach.name ||
    jobRole !== coach.jobRole ||
    employmentType !== coach.employmentType ||
    center.trim() !== coach.center ||
    (tier || null) !== (coach.allowanceTier ?? null) ||
    active !== coach.active;

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
      const res = await fetch(`/api/coaches/${coach.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalName: name.trim(),
          jobRole,
          employmentType,
          center: center.trim(),
          allowanceTier: tier || null,
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
    if (!confirm(`Delete ${coach.name}? Saved KPI/allowance records are kept.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/coaches/${coach.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/staff");
      router.refresh();
    } catch {
      setError("Delete failed");
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-indigo-700">Details</h3>
      <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              className="mt-1"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                touch();
              }}
            />
          </div>
          <div>
            <Label htmlFor="p-role">Role</Label>
            <Select
              id="p-role"
              className="mt-1"
              value={jobRole}
              onChange={(e) => {
                setJobRole(e.target.value as EmployeeRole);
                touch();
              }}
            >
              {EMPLOYEE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {EMPLOYEE_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="p-type">Employment</Label>
            <Select
              id="p-type"
              className="mt-1"
              value={employmentType}
              onChange={(e) => {
                setEmploymentType(e.target.value as EmploymentType);
                touch();
              }}
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="p-center">Center</Label>
            <CenterSelect
              id="p-center"
              className="mt-1"
              centers={centers}
              value={center}
              onChange={(v) => {
                setCenter(v);
                touch();
              }}
            />
          </div>
          <div>
            <Label htmlFor="p-tier">Pay tier</Label>
            <Select
              id="p-tier"
              className="mt-1"
              value={tier}
              onChange={(e) => {
                setTier(e.target.value as AllowanceTier | "");
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
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={active}
                onChange={(e) => {
                  setActive(e.target.checked);
                  touch();
                }}
              />
              Active
            </label>
          </div>
        </div>
      </fieldset>

      {canEdit && (
        <div className="mt-4 flex items-center gap-2">
          <Button onClick={save} disabled={busy || !dirty}>
            {busy ? <Spinner /> : saved && !dirty ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved && !dirty ? "Saved" : "Save"}
          </Button>
          <Button variant="outline" onClick={remove} disabled={busy} className="text-red-600">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      )}
    </Card>
  );
}
