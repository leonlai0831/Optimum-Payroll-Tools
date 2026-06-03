"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileText, Save, Trash2, TrendingUp, Wallet } from "lucide-react";
import { useToast } from "@/components/toast";
import { ConfirmModal } from "@/components/modal";
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
import { rm, splitCenters } from "@/lib/utils";
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

      <DetailsCard
        key={`${coach.id}-${coach.name}-${coach.center}-${coach.jobRole}-${coach.employmentType}-${coach.allowanceTier ?? ""}-${coach.active}`}
        coach={coach}
        centers={centers}
        canEdit={canEdit}
      />
      <AppraisalsSection
        coachId={coach.id}
        appraisals={appraisals}
        dimensions={dimensions}
        canEdit={canEditAppraisals}
      />
      <NotesTimeline coachId={coach.id} notes={notes} canEdit={canEditNotes} />
      <KpiHistoryCard kpi={kpi} />
      <AllowanceHistoryCard allowance={allowance} />
      <PayslipsCard coachId={coach.id} kpi={kpi} allowance={allowance} />
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

function PayslipsCard({
  coachId,
  kpi,
  allowance,
}: {
  coachId: number;
  kpi: KpiPoint[];
  allowance: AllowancePoint[];
}) {
  const periods = [
    ...new Set([...kpi.map((k) => k.period), ...allowance.map((a) => a.period)]),
  ].sort((a, b) => b.localeCompare(a));
  if (periods.length === 0) return null;

  return (
    <Card className="p-4">
      <h3 className="mb-1 flex items-center gap-2 text-h3 text-gray-900">
        <FileText className="h-4 w-4" /> Payslips
      </h3>
      <p className="mb-3 text-sm text-gray-500">
        A one-page PDF combining the KPI bonus and teaching allowance for the month.
      </p>
      <ul className="divide-y divide-gray-100">
        {periods.map((period) => (
          <li key={period} className="flex items-center justify-between py-2">
            <span className="text-sm font-medium text-gray-700">{period}</span>
            <a
              href={`/api/coaches/${coachId}/payslip?period=${encodeURIComponent(period)}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              <Download className="h-4 w-4" /> Payslip
            </a>
          </li>
        ))}
      </ul>
    </Card>
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
  const toast = useToast();
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
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  function setCenter(i: number, value: string) {
    setRowCenters((prev) => prev.map((c, idx) => (idx === i ? value : c)));
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Name required.");
      return;
    }
    setBusy(true);
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
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Save failed");
      }
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
      const res = await fetch(`/api/coaches/${coach.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/staff");
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
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              className="mt-1"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
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
            {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="text-red-600"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      )}
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={`Delete ${coach.name}?`}
        message="Saved KPI and allowance records are kept. This profile and its appraisals/notes will be removed."
        confirmLabel="Delete profile"
        busy={busy}
      />
    </Card>
  );
}
