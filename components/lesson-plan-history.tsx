"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, History, Trash2 } from "lucide-react";
import { Card, Select, buttonClasses } from "@/components/ui";
import { ConfirmModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { EmptyState } from "@/components/empty-state";
import { TableToolbar } from "@/components/table-controls";
import {
  LESSON_PLAN_STATUS_LABELS,
  LESSON_PLAN_TYPE_LABELS,
  LessonPlanSelfEvalHint,
  LessonPlanStatusBadge,
  LessonPlanTypeBadge,
} from "@/components/lesson-plan-badges";
import {
  LESSON_PLAN_STATUSES,
  LESSON_PLAN_TYPES,
  type LessonPlanStatus,
  type LessonPlanType,
  type LevelType,
} from "@/lib/lesson-plan/types";
import { LEVEL_TYPE_LABELS } from "@/lib/lesson-plan/templates";
import { formatDate } from "@/lib/utils";

/** A serialized `LessonPlanListRow` (dates as ISO strings across the RSC boundary). */
export interface LessonPlanHistoryRow {
  id: number;
  createdByUserId: number;
  type: LessonPlanType;
  status: LessonPlanStatus;
  createdByName: string;
  instructorName: string;
  actualInstructorName: string;
  center: string;
  lessonDate: string;
  timeLabel: string;
  levelType: LevelType | null;
  classLevel: string;
  /** ISO timestamp of the post-lesson self-eval fill; null = not filled. */
  selfEvalAt: string | null;
}

function levelLabel(row: LessonPlanHistoryRow): string {
  // Replacement plans pick a level from the level-type's list; actual plans
  // carry free text (often already "Level 2"), so print it verbatim.
  if (row.levelType) {
    const lvl = row.classLevel ? `Level ${row.classLevel}` : "";
    return [LEVEL_TYPE_LABELS[row.levelType], lvl].filter(Boolean).join(" · ");
  }
  return row.classLevel || "—";
}

/**
 * Saved lesson plans, newest lesson first, filterable by type + status.
 * Reviewers see everyone's plans (with the creator column); editors only ever
 * receive their own rows from the server.
 */
export function LessonPlanHistory({
  rows,
  isReviewer,
  isAdmin,
  currentUserId,
}: {
  rows: LessonPlanHistoryRow[];
  isReviewer: boolean;
  /** admin / super_admin: may delete any plan from the list. */
  isAdmin: boolean;
  currentUserId: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [typeFilter, setTypeFilter] = useState<"" | LessonPlanType>("");
  const [statusFilter, setStatusFilter] = useState<"" | LessonPlanStatus>("");
  const [pendingDelete, setPendingDelete] = useState<LessonPlanHistoryRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Same rule as the detail page / DELETE route: admins delete anything,
  // creators only their own drafts.
  const canDelete = (r: LessonPlanHistoryRow) =>
    isAdmin || (r.createdByUserId === currentUserId && r.status === "draft");

  async function deletePlan() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lesson-plans/${pendingDelete.id}`, { method: "DELETE" });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error || "Delete failed");
      toast.success("Lesson plan deleted.");
      setPendingDelete(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (typeFilter === "" || r.type === typeFilter) &&
          (statusFilter === "" || r.status === statusFilter),
      ),
    [rows, typeFilter, statusFilter],
  );

  return (
    <Card className="overflow-hidden">
      <TableToolbar>
        <History className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-bold text-gray-900">Lesson plans</span>
        <span className="text-xs text-gray-500">{filtered.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <Select
            aria-label="Filter by type"
            className="w-auto min-w-28 py-1.5"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "" | LessonPlanType)}
          >
            <option value="">All types</option>
            {LESSON_PLAN_TYPES.map((t) => (
              <option key={t} value={t}>
                {LESSON_PLAN_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by status"
            className="w-auto min-w-28 py-1.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | LessonPlanStatus)}
          >
            <option value="">All statuses</option>
            {LESSON_PLAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LESSON_PLAN_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </TableToolbar>

      {filtered.length === 0 ? (
        <EmptyState
          bare
          icon={ClipboardList}
          title={rows.length === 0 ? "No lesson plans yet" : "No plans match the filters"}
          body={
            rows.length === 0
              ? "Plans you save appear here through review and approval."
              : "Try clearing the type or status filter."
          }
          action={
            rows.length === 0 ? (
              <Link href="/lesson-plans" className={buttonClasses("secondary")}>
                New plan
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <MobileCards>
            {filtered.map((r) => (
              <Link key={r.id} href={`/lesson-plans/${r.id}`} className="block p-4 active:bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{r.instructorName}</div>
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      {formatDate(r.lessonDate)}
                      {r.timeLabel && <span> · {r.timeLabel}</span>}
                      {r.center && <span> · {r.center}</span>}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {levelLabel(r)}
                      {isReviewer && r.createdByName && <span> · by {r.createdByName}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <LessonPlanTypeBadge type={r.type} />
                    <LessonPlanStatusBadge status={r.status} />
                    <LessonPlanSelfEvalHint
                      type={r.type}
                      status={r.status}
                      selfEvalAt={r.selfEvalAt}
                    />
                    {canDelete(r) && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPendingDelete(r);
                        }}
                        className="mt-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                        title="Delete plan"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </MobileCards>
          <DesktopTable>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Instructor</th>
                  <th className="px-4 py-2 text-left">Branch</th>
                  <th className="px-4 py-2 text-left">Level</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  {isReviewer && <th className="px-4 py-2 text-left">Created by</th>}
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 tabular-nums text-gray-700">
                      {formatDate(r.lessonDate)}
                      {r.timeLabel && <span className="text-gray-400"> · {r.timeLabel}</span>}
                    </td>
                    <td className="px-4 py-2">
                      <LessonPlanTypeBadge type={r.type} />
                    </td>
                    <td className="px-4 py-2 font-medium">
                      <Link
                        href={`/lesson-plans/${r.id}`}
                        className="text-indigo-700 hover:underline"
                      >
                        {r.instructorName}
                      </Link>
                      {r.type === "replacement" && r.actualInstructorName && (
                        <span className="text-gray-400"> for {r.actualInstructorName}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{r.center || "—"}</td>
                    <td className="px-4 py-2 text-gray-500">{levelLabel(r)}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <LessonPlanStatusBadge status={r.status} />
                        <LessonPlanSelfEvalHint
                          type={r.type}
                          status={r.status}
                          selfEvalAt={r.selfEvalAt}
                        />
                      </span>
                    </td>
                    {isReviewer && (
                      <td className="px-4 py-2 text-gray-500">{r.createdByName || "—"}</td>
                    )}
                    <td className="px-4 py-2 text-right">
                      {canDelete(r) && (
                        <button
                          onClick={() => setPendingDelete(r)}
                          className="inline-flex items-center text-gray-400 transition hover:text-red-600"
                          title="Delete plan"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTable>
        </>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => !busy && setPendingDelete(null)}
        onConfirm={deletePlan}
        title="Delete this lesson plan?"
        message={
          pendingDelete
            ? `${pendingDelete.instructorName} · ${formatDate(pendingDelete.lessonDate)} — this cannot be undone.`
            : ""
        }
        confirmLabel="Delete plan"
      />
    </Card>
  );
}
