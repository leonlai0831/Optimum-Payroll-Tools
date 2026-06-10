"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, ClipboardCheck, Download, FileText, Save, Trash2, TrendingUp, Wallet } from "lucide-react";
import { useToast } from "@/components/toast";
import { ConfirmModal } from "@/components/modal";
import dynamic from "next/dynamic";
import { Badge, Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { CenterSelect } from "@/components/center-select";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { NotesTimeline, type NoteView } from "@/components/notes-timeline";
import { rm, splitCenters } from "@/lib/utils";
import { nextPeriod } from "@/lib/allowance/period";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";
import { jobRoleForTier } from "@/lib/allowance/tier-rules";
import { GRADE_LABEL, type GradeKey } from "@/lib/assessment/types";

/** A read-only assessment row shown on the profile. */
export interface AssessmentView {
  id: number;
  observedOn: string;
  assessor: string;
  classType: string;
  poolType: string;
  totalPercent: number;
  finalGrade: GradeKey;
  /** Lesson plan of the observed class, when one was linked. */
  lessonPlanId: number | null;
}
import {
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
  notes,
  canEditNotes,
  assessments,
}: {
  coach: CoachProfile;
  centers: string[];
  canEdit: boolean;
  backHref?: string;
  kpi: KpiPoint[];
  allowance: AllowancePoint[];
  notes: NoteView[];
  canEditNotes: boolean;
  assessments: AssessmentView[];
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
      <NotesTimeline subjectId={coach.id} notes={notes} canEdit={canEditNotes} />
      <AssessmentsCard assessments={assessments} />
      <KpiHistoryCard kpi={kpi} />
      <AllowanceHistoryCard allowance={allowance} />
      <IncomeCard coachId={coach.id} kpi={kpi} allowance={allowance} />
    </div>
  );
}

function AssessmentsCard({ assessments }: { assessments: AssessmentView[] }) {
  if (assessments.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <ClipboardCheck className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-bold text-gray-900">Assessments</span>
        <span className="text-xs text-gray-500">{assessments.length}</span>
      </div>
      <MobileCards>
        {assessments.map((a, i) => (
          <div key={a.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="font-medium text-gray-900">
                {new Date(a.observedOn).toLocaleDateString()}
                {i === 0 && (
                  <span className="ml-2 text-[10px] font-semibold uppercase text-indigo-500">
                    latest → KPI
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-gray-400">
                {a.assessor || "—"}
                <span> · {[a.classType, a.poolType].filter(Boolean).join(" · ") || "—"}</span>
              </div>
              {a.lessonPlanId != null && (
                <Link
                  href={`/lesson-plans/${a.lessonPlanId}`}
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                >
                  <BookOpen className="h-3 w-3" /> Lesson plan
                </Link>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-base font-bold tabular-nums text-gray-900">
                {a.totalPercent.toFixed(1)}%
              </div>
              <div className="mt-1">
                <Badge>{GRADE_LABEL[a.finalGrade]}</Badge>
              </div>
            </div>
          </div>
        ))}
      </MobileCards>
      <DesktopTable>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Assessor</th>
              <th className="px-4 py-2 text-left">Class</th>
              <th className="px-4 py-2 text-right">Score</th>
              <th className="px-4 py-2 text-left">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {assessments.map((a, i) => (
              <tr key={a.id}>
                <td className="px-4 py-2 text-gray-700">
                  {new Date(a.observedOn).toLocaleDateString()}
                  {i === 0 && (
                    <span className="ml-2 text-[10px] font-semibold uppercase text-indigo-500">
                      latest → KPI
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">{a.assessor || "—"}</td>
                <td className="px-4 py-2 text-gray-500">
                  {[a.classType, a.poolType].filter(Boolean).join(" · ") || "—"}
                  {a.lessonPlanId != null && (
                    <Link
                      href={`/lesson-plans/${a.lessonPlanId}`}
                      className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                    >
                      <BookOpen className="h-3 w-3" /> Lesson plan
                    </Link>
                  )}
                </td>
                <td className="px-4 py-2 text-right font-medium tabular-nums text-gray-900">
                  {a.totalPercent.toFixed(1)}%
                </td>
                <td className="px-4 py-2">
                  <Badge>{GRADE_LABEL[a.finalGrade]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DesktopTable>
    </Card>
  );
}

// recharts is heavy; load the chart only on the client, after the page paints.
const ProfileScoreChart = dynamic(() => import("@/components/profile-score-chart"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-gray-50" />,
});

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
          <ProfileScoreChart data={chart} />
        </div>
      )}
      <MobileCards>
        {kpi.map((k) => (
          <div key={k.period} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="font-medium text-gray-900">{k.period}</div>
              <div className="mt-0.5 text-[11px] text-gray-400">
                Grade <span className="font-semibold text-gray-600">{k.grade}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-base font-bold tabular-nums text-gray-900">
                {k.finalScore.toFixed(3)}
              </div>
              <div className="text-[11px] tabular-nums text-gray-400">{rm(k.payout)}</div>
            </div>
          </div>
        ))}
      </MobileCards>
      <DesktopTable>
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
      </DesktopTable>
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
      <MobileCards>
        {allowance.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="font-medium text-gray-900">{a.period}</div>
              <div className="mt-0.5 truncate text-[11px] text-gray-400">
                {a.tier}
                <span> · {a.center || "—"}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-base font-bold tabular-nums text-green-700">
                {rm(a.grandTotal)}
              </div>
              <div className="text-[11px] tabular-nums text-gray-400">
                teaching {rm(a.teaching)}
              </div>
            </div>
          </div>
        ))}
      </MobileCards>
      <DesktopTable>
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
      </DesktopTable>
    </Card>
  );
}

function IncomeCard({
  coachId,
  kpi,
  allowance,
}: {
  coachId: number;
  kpi: KpiPoint[];
  allowance: AllowancePoint[];
}) {
  // Month M's income = M's teaching allowance + the KPI bonus earned in M-1
  // (the bonus is computed after month close, so it pays out a cycle later).
  // Offer every month that has either component.
  const periods = [
    ...new Set([
      ...allowance.map((a) => a.period),
      ...kpi.map((k) => nextPeriod(k.period)),
    ]),
  ].sort((a, b) => b.localeCompare(a));
  if (periods.length === 0) return null;

  return (
    <Card className="p-4">
      <h3 className="mb-1 flex items-center gap-2 text-h3 text-gray-900">
        <FileText className="h-4 w-4" /> Monthly income
      </h3>
      <p className="mb-3 text-sm text-gray-500">
        A one-page PDF per payout month: that month&rsquo;s teaching allowance plus the
        previous month&rsquo;s KPI bonus, which pay out together.
      </p>
      <ul className="divide-y divide-gray-100">
        {periods.map((period) => (
          <li key={period} className="flex items-center justify-between py-2">
            <span className="text-sm font-medium text-gray-700">{period}</span>
            <a
              href={`/api/coaches/${coachId}/income?period=${encodeURIComponent(period)}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              <Download className="h-4 w-4" /> Income
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

  // Rule: the role is derived from the pay tier (A1/A2/A3 → front desk, else
  // instructor) and is not editable — change the tier and the role follows.
  const derivedRole = jobRoleForTier(tier || null);

  const dirty =
    name.trim() !== coach.name ||
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
            <div className="mt-1 flex h-[38px] items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
              {EMPLOYEE_ROLE_LABELS[derivedRole]}
              <span className="text-xs text-gray-400">· from pay tier</span>
            </div>
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
        message="Saved KPI and allowance records are kept. This profile and its notes will be removed."
        confirmLabel="Delete profile"
        busy={busy}
      />
    </Card>
  );
}
