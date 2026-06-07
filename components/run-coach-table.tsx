"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Badge, Card } from "@/components/ui";
import { Drawer } from "@/components/drawer";
import { makeCenterNormalizer } from "@/lib/allowance/centers";
import type { RunCoach } from "@/lib/types";
import type { BreakdownItem } from "@/lib/kpi/types";
import { cn, rm } from "@/lib/utils";

// recharts is heavy; load the radar only on the client, after the page paints.
const RadarProfile = dynamic(
  () => import("@/components/radar-chart").then((m) => ({ default: m.RadarProfile })),
  { ssr: false, loading: () => <div className="h-full" /> },
);

/** Grade letter → badge classes (same palette as the live dashboard's getGrade). */
const GRADE_CLASS: Record<string, string> = {
  S: "bg-accent text-[#312b29] border-[#e0a020]",
  A: "bg-indigo-100 text-indigo-800 border-indigo-300",
  B: "bg-amber-100 text-amber-800 border-amber-300",
  C: "bg-red-100 text-red-800 border-red-300",
};

/** Format a metric min/max target for display (percent fractions → "40%"). */
function fmtTarget(v: number, type: BreakdownItem["type"]): string {
  if (type === "percent") return `${(v <= 1 ? v * 100 : v).toFixed(0)}%`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * Read-only per-coach table for a saved KPI run. Each row is clickable and opens a
 * detail drawer with the full score breakdown (per-metric actual / target / weight /
 * score + radar) and the coach's underlying data (merged accounts, inputs), so a
 * finalized month can be inspected the same way the live dashboard's coach drawer
 * shows it — without re-computing anything (everything is read from the snapshot).
 */
export function RunCoachTable({
  coaches,
  centers = [],
  centerAliases = {},
}: {
  coaches: RunCoach[];
  centers?: string[];
  centerAliases?: Record<string, string[]>;
}) {
  const normCenter = useMemo(
    () => makeCenterNormalizer(centers, centerAliases),
    [centers, centerAliases],
  );
  const [active, setActive] = useState<RunCoach | null>(null);

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Coach</th>
              <th className="px-4 py-2 text-left">Center</th>
              <th className="px-4 py-2 text-center">Students</th>
              <th className="px-4 py-2 text-left">Position</th>
              <th className="px-4 py-2 text-center">Score</th>
              <th className="px-4 py-2 text-center">Grade</th>
              <th className="px-4 py-2 text-right">Allowance</th>
              <th className="px-4 py-2 text-right">Payout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {coaches.map((c) => (
              <tr
                key={c.canonicalName}
                className="cursor-pointer hover:bg-indigo-50/40"
                onClick={() => setActive(c)}
                tabIndex={0}
                role="button"
                aria-label={`View ${c.canonicalName} score details`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if (e.key === " ") e.preventDefault();
                    setActive(c);
                  }
                }}
              >
                <td className="px-4 py-2 font-medium text-indigo-700 underline-offset-2 hover:underline">
                  {c.canonicalName}
                  {!c.isComplete && (
                    <span className="ml-2 text-[10px] text-amber-600">incomplete</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">{normCenter(c.center)}</td>
                <td className="px-4 py-2 text-center text-gray-600">{c.students}</td>
                <td className="px-4 py-2 text-gray-600">{c.position}</td>
                <td className="px-4 py-2 text-center font-bold text-indigo-600">
                  {c.finalScore.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-center">
                  <Badge className={GRADE_CLASS[c.grade] ?? "border-gray-300 bg-gray-100 text-gray-700"}>
                    {c.grade}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {c.teachingAllowance ? rm(c.teachingAllowance) : "—"}
                </td>
                <td className="px-4 py-2 text-right font-medium text-green-700">{rm(c.payout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {active && (
        <CoachDetailDrawer coach={active} normCenter={normCenter} onClose={() => setActive(null)} />
      )}
    </Card>
  );
}

function CoachDetailDrawer({
  coach,
  normCenter,
  onClose,
}: {
  coach: RunCoach;
  normCenter: (raw: string) => string;
  onClose: () => void;
}) {
  const radarData = coach.breakdown.map((b) => ({ metric: b.name, score: b.score }));
  const isSupervisor = coach.position === "Pool Supervisor";

  return (
    <Drawer
      open
      onClose={onClose}
      header={
        <>
          <h3 className="text-h2 text-gray-900">{coach.canonicalName}</h3>
          <p className="text-caption text-muted">
            {coach.position} · {normCenter(coach.center) || "—"} · {coach.students} students
            {!coach.isComplete && <span className="ml-1.5 text-amber-600">· incomplete</span>}
          </p>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <p className="text-[11px] text-gray-500">Final Score</p>
          <p className="text-xl font-bold text-indigo-600">{coach.finalScore.toFixed(2)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-gray-500">Grade</p>
          <p className="mt-1">
            <Badge className={GRADE_CLASS[coach.grade] ?? "border-gray-300 bg-gray-100 text-gray-700"}>
              {coach.grade}
            </Badge>
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-gray-500">Payout</p>
          <p className="text-xl font-bold text-green-700">{rm(coach.payout)}</p>
        </Card>
      </div>

      {isSupervisor && (
        <p className="mt-2 text-[11px] text-gray-500">
          Supervisor final = (personal {coach.personalScore.toFixed(2)} + group{" "}
          {coach.groupScore.toFixed(2)}) / 2.
        </p>
      )}

      <div className="mt-4 h-56">
        <RadarProfile data={radarData} />
      </div>

      <div className="mt-4">
        <h4 className="mb-2 text-sm font-bold text-gray-700">Score Breakdown</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="py-1 text-left">Metric</th>
                <th className="py-1 text-center">Actual</th>
                <th className="py-1 text-center">Target</th>
                <th className="py-1 text-center">Weight</th>
                <th className="py-1 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {coach.breakdown.map((b) => (
                <tr key={b.id} className="border-t border-gray-100">
                  <td className="py-1 font-medium text-gray-800">{b.name}</td>
                  <td className="py-1 text-center text-gray-600">{b.displayValue}</td>
                  <td className="py-1 text-center text-gray-400">
                    {fmtTarget(b.min, b.type)}–{fmtTarget(b.max, b.type)}
                  </td>
                  <td className="py-1 text-center text-gray-500">{(b.w * 100).toFixed(0)}%</td>
                  <td
                    className={cn(
                      "py-1 text-center font-semibold",
                      b.score >= 1.2
                        ? "text-green-600"
                        : b.score < 0.8
                          ? "text-red-500"
                          : "text-indigo-600",
                    )}
                  >
                    {b.score.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <h4 className="mb-2 text-sm font-bold text-gray-700">Coach Data</h4>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <Field label="Center" value={normCenter(coach.center) || "—"} />
          <Field label="Position" value={coach.position} />
          <Field label="Students" value={String(coach.students)} />
          <Field
            label="Teaching allowance"
            value={coach.teachingAllowance ? rm(coach.teachingAllowance) : "—"}
          />
          <Field
            label="Mgmt assessment"
            value={coach.mgmtAssessment != null ? `${coach.mgmtAssessment}` : "—"}
          />
          <Field label="Payout" value={rm(coach.payout)} />
        </dl>
        {coach.accounts.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">
              Merged accounts ({coach.accounts.length})
            </p>
            <p className="mt-0.5 text-xs text-gray-600">{coach.accounts.join(", ")}</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 py-0.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-800">{value}</dd>
    </div>
  );
}
