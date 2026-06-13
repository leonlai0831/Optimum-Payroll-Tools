"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CheckCircle2,
  Save,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { ConfirmModal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { useToast } from "@/components/toast";
import { computeCoach } from "@/lib/kpi/coach";
import type { AppConfig, InstructorRow } from "@/lib/kpi/types";
import type { GroupConfig, Position, RunCoach } from "@/lib/types";
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

export function RunReview({
  run,
  assessmentByCoach,
  centers,
}: {
  run: ReviewRun;
  /** coachId → latest assessment final % — auto-fills + locks that coach's Mgmt %. */
  assessmentByCoach: Record<number, number>;
  /** Configured center codes — options for a supervisor's group-hours editor. */
  centers: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<ReviewRow[]>(() =>
    run.coachResults.map((rc) => {
      // A coach with an assessment record gets that score, locked (no manual key-in).
      const locked = rc.coachId != null ? assessmentByCoach[rc.coachId] : undefined;
      const seeded = locked != null ? { ...rc, mgmtAssessment: locked } : rc;
      return recomputeRow(seeded, run.csvRows, run.configSnapshot);
    }),
  );
  const [saving, setSaving] = useState<"idle" | "progress" | "finalize">("idle");
  // Pending "move this account from another coach" awaiting confirmation in a modal.
  const [pendingMove, setPendingMove] = useState<{
    account: string;
    fromIdx: number;
    toIdx: number;
  } | null>(null);

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

  // Every CSV account this month, for the "add class data" search. Labelled with
  // its student total and current owner (if any) so the reviewer picks the right one.
  const allAccountOptions = useMemo(() => {
    const ownerOf = new Map<string, string>();
    for (const r of rows) for (const a of r.rc.accounts) ownerOf.set(a, r.rc.canonicalName);
    return [...accountStudents.keys()].sort().map((name) => {
      const owner = ownerOf.get(name);
      return {
        value: name,
        label: `${name} (${accountStudents.get(name) ?? 0})${owner ? ` · ${owner}` : ""}`,
      };
    });
  }, [rows, accountStudents]);

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

  /** Switch a coach between Instructor and Pool Supervisor; recompute. A
   *  supervisor needs group/center hours (entered below) — not in the CSV. */
  function setPosition(idx: number, position: Position) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = recomputeRow(
        { ...next[idx].rc, position },
        run.csvRows,
        run.configSnapshot,
      );
      return next;
    });
  }

  /** Set a supervisor's group config (center + hours, weighted /40); recompute. */
  function setGroupConfig(idx: number, gc: GroupConfig) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = recomputeRow(
        { ...next[idx].rc, groupConfig: gc },
        run.csvRows,
        run.configSnapshot,
      );
      return next;
    });
  }

  /** Remove one CSV account from a coach; recompute. */
  function removeAccount(idx: number, account: string) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = recomputeRow(
        { ...next[idx].rc, accounts: next[idx].rc.accounts.filter((a) => a !== account) },
        run.csvRows,
        run.configSnapshot,
      );
      return next;
    });
  }

  /**
   * Add a CSV account to a coach. Accounts are exclusive — a class is scored for
   * exactly one coach — so if it currently belongs to someone else, confirm (via
   * modal) and move it (removing it from the previous owner) rather than
   * double-counting.
   */
  function addAccount(idx: number, account: string) {
    const ownerIdx = rows.findIndex((r) => r.rc.accounts.includes(account));
    if (ownerIdx === idx) return; // already here
    if (ownerIdx !== -1) {
      setPendingMove({ account, fromIdx: ownerIdx, toIdx: idx });
      return;
    }
    applyAddAccount(idx, account, -1);
  }

  /** Apply the add/move (after any confirmation): recompute both coaches. */
  function applyAddAccount(idx: number, account: string, ownerIdx: number) {
    setRows((prev) => {
      const next = [...prev];
      if (ownerIdx !== -1) {
        next[ownerIdx] = recomputeRow(
          { ...next[ownerIdx].rc, accounts: next[ownerIdx].rc.accounts.filter((a) => a !== account) },
          run.csvRows,
          run.configSnapshot,
        );
      }
      next[idx] = recomputeRow(
        { ...next[idx].rc, accounts: [...next[idx].rc.accounts, account] },
        run.csvRows,
        run.configSnapshot,
      );
      return next;
    });
    toast.success(`Linked ${account} → ${rows[idx].rc.canonicalName}`);
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
        right person. <strong>Add</strong> or <strong>remove</strong> class-data accounts per coach —
        scores recompute live. Edits here adjust <strong>this saved month only</strong>; finalizing
        also remembers the corrected accounts for future uploads (manage the standing rules on the
        Links page). <strong>Finalize</strong> unlocks once every coach is complete.
      </p>

      {rows.map((r, idx) => {
        const empty = r.rc.accounts.length === 0;
        const mgmtLocked = r.rc.coachId != null && assessmentByCoach[r.rc.coachId] != null;
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
                {/* Position drives the supervisor group-score average; not in the CSV. */}
                <Select
                  aria-label={`Position for ${r.rc.canonicalName}`}
                  value={r.rc.position}
                  onChange={(e) => setPosition(idx, e.target.value as Position)}
                  className="w-28 py-1 text-xs"
                  disabled={empty}
                >
                  <option value="Instructor">Instructor</option>
                  <option value="Pool Supervisor">Supervisor</option>
                </Select>
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
                  disabled={empty || mgmtLocked}
                  title={mgmtLocked ? "From the latest assessment record — locked" : undefined}
                />
                {mgmtLocked && (
                  <span className="text-[10px] font-medium text-brand">assessment · locked</span>
                )}
              </div>
            </div>

            {/* Supervisor group score = (personal + center group) / 2 — needs the
                supervision hours (longer than the CSV/clock-in teaching hours), so
                they're entered by hand here. Weighted /40. */}
            {!empty && r.rc.position === "Pool Supervisor" && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                <span className="text-[11px] uppercase tracking-wide text-gray-400">
                  Group hours
                </span>
                <Select
                  aria-label={`Group center for ${r.rc.canonicalName}`}
                  value={r.rc.groupConfig?.center1 ?? ""}
                  onChange={(e) =>
                    setGroupConfig(idx, {
                      center1: e.target.value,
                      hours1: r.rc.groupConfig?.hours1 ?? 40,
                      center2: r.rc.groupConfig?.center2,
                      hours2: r.rc.groupConfig?.hours2,
                    })
                  }
                  className="w-40 py-1 text-xs"
                >
                  <option value="">— select center —</option>
                  {centers.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={0}
                  max={40}
                  aria-label={`Group hours for ${r.rc.canonicalName}`}
                  value={r.rc.groupConfig?.hours1 ?? 40}
                  onChange={(e) =>
                    setGroupConfig(idx, {
                      center1: r.rc.groupConfig?.center1 ?? "",
                      hours1: Number(e.target.value),
                      center2: r.rc.groupConfig?.center2,
                      hours2: r.rc.groupConfig?.hours2,
                    })
                  }
                  className="w-20 py-1 text-xs"
                />
                <span className="text-[11px] text-gray-400">/ 40 hrs</span>
              </div>
            )}

            {/* Class-data linkage: accounts merged into this coach — add or remove. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
              <span className="text-[11px] uppercase tracking-wide text-gray-400">Class data</span>
              {r.rc.accounts.map((a) => (
                <span
                  key={a}
                  className="flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px]"
                >
                  <span className="font-medium text-gray-700">{a}</span>
                  <span className="text-gray-400">({accountStudents.get(a) ?? 0})</span>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-600"
                    onClick={() => removeAccount(idx, a)}
                    aria-label={`Remove ${a}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <SearchableSelect
                className="w-44"
                placeholder="+ add class data…"
                searchPlaceholder="Search CSV account…"
                options={allAccountOptions.filter((o) => !r.rc.accounts.includes(o.value))}
                onSelect={(value) => addAccount(idx, value)}
              />
            </div>
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

      {/* Confirm moving an account that already belongs to another coach. */}
      <ConfirmModal
        open={pendingMove != null}
        onClose={() => setPendingMove(null)}
        onConfirm={() => {
          if (!pendingMove) return;
          applyAddAccount(pendingMove.toIdx, pendingMove.account, pendingMove.fromIdx);
          setPendingMove(null);
        }}
        title="Move class data?"
        message={
          pendingMove
            ? `"${pendingMove.account}" is currently linked to ${rows[pendingMove.fromIdx].rc.canonicalName}. Move it to ${rows[pendingMove.toIdx].rc.canonicalName}?`
            : ""
        }
        confirmLabel="Move"
      />
    </div>
  );
}
