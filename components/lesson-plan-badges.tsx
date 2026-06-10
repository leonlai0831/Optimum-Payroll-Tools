import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui";
import type { LessonPlanStatus, LessonPlanType } from "@/lib/lesson-plan/types";

/** Shared status/type chips for the lesson-plan list + detail (server-safe). */

export const LESSON_PLAN_STATUS_LABELS: Record<LessonPlanStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  changes_requested: "Changes requested",
};

const STATUS_CLASS: Record<LessonPlanStatus, string> = {
  draft: "border-gray-300 bg-gray-100 text-gray-600",
  submitted: "border-blue-300 bg-blue-100 text-blue-800",
  approved: "border-green-300 bg-green-100 text-green-800",
  changes_requested: "border-amber-300 bg-amber-100 text-amber-800",
};

export function LessonPlanStatusBadge({ status }: { status: LessonPlanStatus }) {
  return <Badge className={STATUS_CLASS[status]}>{LESSON_PLAN_STATUS_LABELS[status]}</Badge>;
}

export const LESSON_PLAN_TYPE_LABELS: Record<LessonPlanType, string> = {
  actual: "Actual",
  replacement: "Replacement",
};

/**
 * Post-lesson self-evaluation hint next to the status badge (replacement
 * plans only): an approved plan still awaiting its self-eval gets an amber
 * nudge; a filled one gets a subtle green tick.
 */
export function LessonPlanSelfEvalHint({
  type,
  status,
  selfEvalAt,
}: {
  type: LessonPlanType;
  status: LessonPlanStatus;
  selfEvalAt: string | Date | null;
}) {
  if (type !== "replacement") return null;
  if (selfEvalAt) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700"
        title="Self-evaluation completed"
      >
        <CheckCircle2 className="h-3 w-3" /> Self-eval
      </span>
    );
  }
  if (status !== "approved") return null;
  return <Badge className="border-amber-300 bg-amber-50 text-amber-800">Awaiting self-eval</Badge>;
}

export function LessonPlanTypeBadge({ type }: { type: LessonPlanType }) {
  return (
    <Badge
      className={
        type === "actual"
          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
          : "border-violet-300 bg-violet-50 text-violet-700"
      }
    >
      {LESSON_PLAN_TYPE_LABELS[type]}
    </Badge>
  );
}
