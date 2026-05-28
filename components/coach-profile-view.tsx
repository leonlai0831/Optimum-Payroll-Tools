"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Save, Trash2, TrendingUp, Wallet } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { CenterSelect } from "@/components/center-select";
import { AppraisalsSection, type AppraisalView } from "@/components/appraisals-section";
import { NotesTimeline, type NoteView } from "@/components/notes-timeline";
import { rm } from "@/lib/utils";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  type AppraisalDimension,
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

export interface KpiPoint {
  period: string;
  finalScore: number;
  grade: string;
  payout: number;
  students: number;
}

export interface AllowancePoint {
  id: number;
  period: string;
  tier: string;
  center: string;
  teaching: number;
  grandTotal: number;
}

export function CoachProfileView({
  coach,
  centers,
  canEdit,
  backHref,
  kpi,
  allowance,
  appraisals,
  dimensions,
  canEditAppraisals,
  notes,
  canEditNotes,
}: {
  coach: CoachProfile;
  centers: string[];
  canEdit: boolean;
  backHref?: string;
  kpi: KpiPoint[];
  allowance: AllowancePoint[];
  appraisals: AppraisalView[];
  dimensions: AppraisalDimension[];
  canEditAppraisals: boolean;
  notes: NoteView[];
  canEditNotes: boolean;
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
      <AppraisalsSection
        coachId={coach.id}
        appraisals={appraisals}
        dimensions={dimensions}
        canEdit={canEditAppraisals}
      />
      <NotesTimeline coachId={coach.id} notes={notes} canEdit={canEditNotes} />
      <KpiHistoryCard kpi={kpi} />
      <AllowanceHistoryCard allowance={allowance} />
    </div>
  );
}

function KpiHistoryCard({ kpi }: { kpi: KpiPoint[] }) {
  if (kpi.length === 0) return null;
  const chart = kpi.map((k) => ({ period: k.period, score: Number(k.finalScore.toFixed(2)) }));
  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-h3 text-gray-900">
        <TrendingUp className="h-4 w-4" /> KPI history
      </h3>
      {kpi.length > 1 && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, "auto"]} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#0061ff" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-2 py-1 text-left">Period</th>
              <th className="px-2 py-1 text-right">Score</th>
              <th className="px-2 py-1 text-center">Grade</th>
              <th className="px-2 py-1 text-right">Payout</th>
            </tr>
          </thead>
          <tbody>
            {kpi.map((k) => (
              <tr key={k.period} className="border-t border-gray-100">
                <td className="px-2 py-1 text-gray-700">{k.period}</td>
                <td className="px-2 py-1 text-right text-gray-900">{k.finalScore.toFixed(3)}</td>
                <td className="px-2 py-1 text-center font-semibold">{k.grade}</td>
                <td className="px-2 py-1 text-right text-gray-900">{rm(k.payout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AllowanceHistoryCard({ allowance }: { allowance: AllowancePoint[] }) {
  if (allowance.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-h3 text-gray-900">
        <Wallet className="h-4 w-4" /> Allowance history
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-2 py-1 text-left">Period</th>
              <th className="px-2 py-1 text-left">Tier</th>
              <th className="px-2 py-1 text-left">Center</th>
              <th className="px-2 py-1 text-right">Teaching</th>
              <th className="px-2 py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {allowance.map((a) => (
              <tr key={a.id} className="border-t border-gray-100">
                <td className="px-2 py-1 text-gray-700">{a.period}</td>
                <td className="px-2 py-1 text-gray-700">{a.tier}</td>
                <td className="px-2 py-1 text-gray-700">{a.center || "—"}</td>
                <td className="px-2 py-1 text-right text-gray-900">{rm(a.teaching)}</td>
                <td className="px-2 py-1 text-right text-gray-900">{rm(a.grandTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Centers are stored as one comma-joined string; edited here as up to 3 slots. */
function splitCenters(center: string): string[] {
  return center
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
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
  const initialCenters = splitCenters(coach.center);
  const [rowCenters, setRowCenters] = useState<string[]>([
    initialCenters[0] ?? "",
    initialCenters[1] ?? "",
    initialCenters[2] ?? "",
  ]);
  const [tier, setTier] = useState<AllowanceTier | "">(coach.allowanceTier ?? "");
  const [active, setActive] = useState(coach.active);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const joinedCenters = rowCenters
    .map((c) => c.trim())
    .filter(Boolean)
    .join(", ");
  const normalizedOriginal = splitCenters(coach.center).join(", ");

  const dirty =
    name.trim() !== coach.name ||
    jobRole !== coach.jobRole ||
    employmentType !== coach.employmentType ||
    joinedCenters !== normalizedOriginal ||
    (tier || null) !== (coach.allowanceTier ?? null) ||
    active !== coach.active;

  function touch() {
    setSaved(false);
    setError("");
  }

  function setCenter(i: number, value: string) {
    setRowCenters((prev) => prev.map((c, idx) => (idx === i ? value : c)));
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
      const res = await fetch(`/api/coaches/${coach.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalName: name.trim(),
          jobRole,
          employmentType,
          center: joinedCenters,
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
      <h3 className="mb-3 text-h3 text-gray-900">Details</h3>
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
            <Label htmlFor="p-center-1">Center 1</Label>
            <CenterSelect
              id="p-center-1"
              className="mt-1"
              centers={centers}
              value={rowCenters[0]}
              onChange={(v) => setCenter(0, v)}
            />
          </div>
          <div>
            <Label htmlFor="p-center-2">Center 2</Label>
            <CenterSelect
              id="p-center-2"
              className="mt-1"
              centers={centers}
              value={rowCenters[1]}
              placeholder="—"
              onChange={(v) => setCenter(1, v)}
            />
          </div>
          <div>
            <Label htmlFor="p-center-3">Center 3</Label>
            <CenterSelect
              id="p-center-3"
              className="mt-1"
              centers={centers}
              value={rowCenters[2]}
              placeholder="—"
              onChange={(v) => setCenter(2, v)}
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
