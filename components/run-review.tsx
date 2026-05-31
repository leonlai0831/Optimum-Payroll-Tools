"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CheckCircle2,
  Save,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { useToast } from "@/components/toast";
import { computeCoach } from "@/lib/kpi/coach";
import type { AppConfig, InstructorRow } from "@/lib/kpi/types";
import type { RunCoach } from "@/lib/types";
import { cn, rm } from "@/lib/utils";

export interface ReviewRun {
  id: number;
  periodLabel: string;
  filename: string;
  csvRows: InstructorRow[];
  configSnapshot: AppConfig;
  coachResults: RunCoach[];
}

interface ReviewRow {
  rc: RunCoach;
  missing: string[];
}

/** Recompute a coach's outputs + readiness from its (possibly edited) inputs. */
function recomputeRow(rc: RunCoach, rows: InstructorRow[], config: AppConfig): ReviewRow {
  const comp = computeCoach({
    accounts: rc.accounts,
    rows,
    config,
    inputs: {
      position: rc.position,
      teachingAllowance: rc.teachingAllowance,
      mgmtAssessment: rc.mgmtAssessment,
      groupConfig: rc.groupConfig,
    },
  });
  return {
    rc: {
      ...rc,
      students: comp.students,
      personalScore: comp.personalScore,
      groupScore: comp.groupScore,
      finalScore: comp.finalScore,
      grade: comp.grade,
      payout: comp.payout,
      breakdown: comp.breakdown,
      isComplete: comp.isComplete,
    },
    missing: comp.missing,
  };
}

export function RunReview({ run }: { run: ReviewRun }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<ReviewRow[]>(() =>
    run.coachResults.map((rc) => recomputeRow(rc, run.csvRows, run.configSnapshot)),
  );
  const [saving, setSaving] = useState<"idle" | "progress" | "finalize">("idle");

  // Per-account student totals (from the stored CSV) so the reviewer can sanity-check
  // which class data is attributed to whom.
  const accountStudents = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of run.csvRows) {
      m.set(r.Instructor, (m.get(r.Instructor) ?? 0) + (r.TotalStudent ?? 0));
    }
    return m;
  }, [run.csvRows]);

  const active = rows.filter((r) => r.rc.accounts.length > 0);
  const completeCount = active.filter((r) => r.rc.isComplete).length;
  const allComplete = active.length > 0 && completeCount === active.length;

  function setMgmt(idx: number, value: string) {
    const mgmt = value === "" ? null : Number(value);
    if (mgmt != null && Number.isNaN(mgmt)) return;
    setRows((prev) => {
      const next = [...prev];
      next[idx] = recomputeRow(
        { ...next[idx].rc, mgmtAssessment: mgmt },
        run.csvRows,
        run.configSnapshot,
      );
      return next;
    });
  }

  /** Move one CSV account from coach `fromIdx` to coach `toIdx`; recompute both. */
  function moveAccount(fromIdx: number, account: string, toIdx: number) {
    if (fromIdx === toIdx) return;
    setRows((prev) => {
      const from = prev[fromIdx];
      const to = prev[toIdx];
      if (!from || !to) return prev;
      const next = [...prev];
      next[fromIdx] = recomputeRow(
        { ...from.rc, accounts: from.rc.accounts.filter((a) => a !== account) },
        run.csvRows,
        run.configSnapshot,
      );
      next[toIdx] = recomputeRow(
        {
          ...to.rc,
          accounts: to.rc.accounts.includes(account)
            ? to.rc.accounts
            : [...to.rc.accounts, account],
        },
        run.csvRows,
        run.configSnapshot,
      );
      return next;
    });
    toast.success(`Moved ${account} → ${rows[toIdx].rc.canonicalName}`);
  }

  async function save(finalize: boolean) {
    // Drop coaches left with no class data (an artifact of correcting a wrong link).
    const coachResults = rows.filter((r) => r.rc.accounts.length > 0).map((r) => r.rc);
    setSaving(finalize ? "finalize" : "progress");
    try {
      const res = await fetch(`/api/runs/${run.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachResults, finalize }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const { status } = (await res.json()) as { status: string };
      toast.success(status === "finalized" ? "Month finalized." : "Review saved.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving("idle");
    }
  }

  return (
    <div className="space-y-3">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/80 p-3 backdrop-blur">
        <div className="text-sm">
          <span className="font-semibold text-indigo-900">{completeCount}</span>
          <span className="text-indigo-800/80"> / {active.length} reviewed</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => save(false)}
            disabled={saving !== "idle"}
          >
            <Save className="h-3.5 w-3.5" /> Save progress
          </Button>
          <Button
            size="sm"
            onClick={() => save(true)}
            disabled={saving !== "idle" || !allComplete}
            title={allComplete ? "Finalize this month" : "Fill every coach's review first"}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Finalize
          </Button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Enter each coach&apos;s management assessment and confirm the class data is linked to the
        right person. Use <strong>move</strong> to reassign a mis-linked account — scores recompute
        live. <strong>Finalize</strong> unlocks once every coach is complete.
      </p>

      {rows.map((r, idx) => {
        const empty = r.rc.accounts.length === 0;
        const moveTargets = rows
          .map((other, j) => ({ other, j }))
          .filter(({ j }) => j !== idx)
          .map(({ other, j }) => ({
            value: String(j),
            label: `${other.rc.canonicalName} (${other.rc.students} students)`,
          }));
        return (
          <Card
            key={`${r.rc.canonicalName}-${idx}`}
            className={cn(
              "p-3",
              empty && "opacity-50",
              !empty && !r.rc.isComplete && "border-amber-200 bg-amber-50/40",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-gray-900">{r.rc.canonicalName}</span>
              <span className="text-xs text-gray-400">{r.rc.center || "—"}</span>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Users className="h-3 w-3" /> {r.rc.students}
              </span>
              {empty ? (
                <Badge className="border-gray-300 bg-gray-100 text-gray-500">
                  no class data — will be removed
                </Badge>
              ) : r.rc.isComplete ? (
                <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {r.rc.finalScore.toFixed(2)} ·{" "}
                  {r.rc.grade} · {rm(r.rc.payout)}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
                  <TriangleAlert className="h-3.5 w-3.5" /> needs {r.missing.join(", ")}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <label className="text-xs text-gray-500" htmlFor={`mgmt-${idx}`}>
                  Mgmt&nbsp;%
                </label>
                <Input
                  id={`mgmt-${idx}`}
                  type="number"
                  min={0}
                  max={100}
                  value={r.rc.mgmtAssessment ?? ""}
                  onChange={(e) => setMgmt(idx, e.target.value)}
                  className="w-20 py-1 text-xs"
                  placeholder="—"
                  disabled={empty}
                />
              </div>
            </div>

            {/* Class-data linkage: accounts merged into this coach, with reassignment. */}
            {!empty && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
                <span className="text-[11px] uppercase tracking-wide text-gray-400">
                  Class data
                </span>
                {r.rc.accounts.map((a) => (
                  <span
                    key={a}
                    className="flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px]"
                  >
                    <span className="font-medium text-gray-700">{a}</span>
                    <span className="text-gray-400">({accountStudents.get(a) ?? 0})</span>
                    <SearchableSelect
                      className="w-28"
                      placeholder="move…"
                      searchPlaceholder="Move to coach…"
                      options={moveTargets}
                      onSelect={(value) => moveAccount(idx, a, Number(value))}
                    />
                  </span>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      {/* Bottom actions mirror the top bar for long lists. */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving !== "idle"}>
          <Save className="h-3.5 w-3.5" /> Save progress
        </Button>
        <Button size="sm" onClick={() => save(true)} disabled={saving !== "idle" || !allComplete}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Finalize
        </Button>
      </div>

      {!allComplete && (
        <p className="flex items-center justify-end gap-1 text-[11px] text-amber-600">
          <ArrowLeftRight className="h-3 w-3" />
          {active.length - completeCount} coach(es) still incomplete — finalize is locked.
        </p>
      )}
    </div>
  );
}
