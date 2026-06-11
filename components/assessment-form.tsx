"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, RotateCcw, Save } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner, Textarea } from "@/components/ui";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { SearchableSelect } from "@/components/searchable-select";
import { useToast } from "@/components/toast";
import { cn, formatDate } from "@/lib/utils";
import {
  ASSESSMENT_FORM,
  CLASS_TYPES,
  GRADE_LABEL,
  LEVELS,
  MAX_PAX,
  POOL_TYPES,
  RATINGS,
  RATING_LABELS,
  type Rating,
  type RatingMap,
} from "@/lib/assessment/types";
import { computeAssessment } from "@/lib/assessment/calc";
import {
  LESSON_PLAN_STATUS_LABELS,
  LESSON_PLAN_TYPE_LABELS,
} from "@/components/lesson-plan-badges";
import { LEVEL_TYPE_LABELS } from "@/lib/lesson-plan/templates";
import type { LessonPlanStatus, LessonPlanType, LevelType } from "@/lib/lesson-plan/types";

/** An instructor the form can be filed against. */
export interface InstructorOption {
  id: number;
  name: string;
}

/** The slice of a lesson-plan list row the picker needs (JSON-serialized). */
interface PlanOption {
  id: number;
  type: LessonPlanType;
  status: LessonPlanStatus;
  center: string;
  lessonDate: string;
  levelType: LevelType | null;
}

/** "6/10/2026 · Replacement · Medium · QSM (Approved)" */
function planOptionLabel(p: PlanOption): string {
  const parts = [
    formatDate(p.lessonDate),
    LESSON_PLAN_TYPE_LABELS[p.type],
    ...(p.levelType ? [LEVEL_TYPE_LABELS[p.levelType]] : []),
    ...(p.center ? [p.center] : []),
  ];
  return `${parts.join(" · ")} (${LESSON_PLAN_STATUS_LABELS[p.status]})`;
}

/**
 * The instructor observation form — the default landing of the assessment
 * module. Pick the instructor from a searchable dropdown, rate each criterion on
 * the 4-point scale (scores recompute live), add comments, and save. The server
 * recomputes + snapshots the score, which feeds that instructor's KPI Mgmt %.
 */
export function AssessmentForm({ instructors }: { instructors: InstructorOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [coachId, setCoachId] = useState<number | null>(null);
  const [classType, setClassType] = useState("");
  const [poolType, setPoolType] = useState("");
  const [levels, setLevels] = useState<string[]>([]);
  const [pax, setPax] = useState("");
  const [hasHelper, setHasHelper] = useState(false);
  const [observedOn, setObservedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [ratings, setRatings] = useState<RatingMap>({});
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  // Optional link to the observed class's lesson plan — the picker lists the
  // selected coach's plans, fetched when the coach changes.
  const [lessonPlanId, setLessonPlanId] = useState<number | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);

  useEffect(() => {
    if (coachId == null) return;
    let cancelled = false;
    fetch(`/api/lesson-plans?coachId=${coachId}`)
      .then((res) => (res.ok ? res.json() : { plans: [] }))
      .then((data: { plans?: PlanOption[] }) => {
        if (!cancelled) setPlans(data.plans ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [coachId]);

  // Closest lesson to the observed date first — the likely class on top.
  const sortedPlans = useMemo(() => {
    const observed = new Date(observedOn).getTime();
    const distance = (p: PlanOption) => Math.abs(new Date(p.lessonDate).getTime() - observed);
    return [...plans].sort((a, b) => distance(a) - distance(b));
  }, [plans, observedOn]);

  function toggleLevel(lvl: string) {
    setLevels((prev) => (prev.includes(lvl) ? prev.filter((l) => l !== lvl) : [...prev, lvl]));
  }

  const result = useMemo(() => computeAssessment(ratings), [ratings]);
  const subScore = (key: string) =>
    result.parts.flatMap((p) => p.subScores).find((s) => s.key === key)?.score ?? 0;
  const selectedName = instructors.find((i) => i.id === coachId)?.name;

  function setRating(key: string, r: Rating) {
    setRatings((prev) => ({ ...prev, [key]: r }));
  }

  function reset() {
    setCoachId(null);
    setClassType("");
    setPoolType("");
    setLevels([]);
    setPax("");
    setHasHelper(false);
    setObservedOn(new Date().toISOString().slice(0, 10));
    setRatings({});
    setComments("");
    setLessonPlanId(null);
    setPlans([]);
  }

  async function save() {
    if (coachId == null) {
      toast.error("Select an instructor first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachId,
          observedOn,
          classType,
          poolType,
          levels,
          pax: pax ? Number(pax) : null,
          hasHelper,
          ratings,
          comments: comments.trim(),
          lessonPlanId,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      toast.success(`Saved — ${selectedName ?? "instructor"} · ${result.totalPercent.toFixed(1)}%`);
      reset();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-h3 text-gray-900">
        <ClipboardCheck className="h-4 w-4 text-indigo-500" /> New assessment
      </h3>

      {/* Header — instructor + observation details */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Instructor</Label>
          <SearchableSelect
            className="mt-1"
            placeholder={selectedName ?? "Select instructor…"}
            searchPlaceholder="Search instructor…"
            options={instructors.map((i) => ({ value: String(i.id), label: i.name }))}
            onSelect={(v) => {
              setCoachId(Number(v));
              // The plan link is per-coach: clear it (and the stale list) on change.
              setLessonPlanId(null);
              setPlans([]);
            }}
          />
        </div>
        <div>
          <Label htmlFor="a-class">Class type</Label>
          <Select id="a-class" className="mt-1" value={classType} onChange={(e) => setClassType(e.target.value)}>
            <option value="">Select class type…</option>
            {CLASS_TYPES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="a-pool">Pool type</Label>
          <Select id="a-pool" className="mt-1" value={poolType} onChange={(e) => setPoolType(e.target.value)}>
            <option value="">Select pool…</option>
            {POOL_TYPES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="a-pax">No. of pax</Label>
          <Select id="a-pax" className="mt-1" value={pax} onChange={(e) => setPax(e.target.value)}>
            <option value="">—</option>
            {Array.from({ length: MAX_PAX }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="a-date">Date</Label>
          <Input id="a-date" type="date" className="mt-1" value={observedOn} onChange={(e) => setObservedOn(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="a-plan">Lesson plan</Label>
          <Select
            id="a-plan"
            className="mt-1"
            value={lessonPlanId == null ? "" : String(lessonPlanId)}
            onChange={(e) => setLessonPlanId(e.target.value ? Number(e.target.value) : null)}
            disabled={coachId == null || plans.length === 0}
          >
            <option value="">— none —</option>
            {sortedPlans.map((p) => (
              <option key={p.id} value={p.id}>
                {planOptionLabel(p)}
              </option>
            ))}
          </Select>
          {coachId != null && plans.length === 0 && (
            <p className="mt-1 text-[11px] text-gray-400">No lesson plans for this instructor.</p>
          )}
        </div>
        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={hasHelper}
              onChange={(e) => setHasHelper(e.target.checked)}
            />
            Has helper
          </label>
        </div>
      </div>

      {/* Levels present in the class (ticked, no per-level count) */}
      <div className="mt-3">
        <Label>Levels</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {LEVELS.map((lvl) => {
            const on = levels.includes(lvl);
            return (
              <label
                key={lvl}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-sm ${on ? "border-indigo-300 bg-indigo-50" : "border-gray-200"}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-indigo-600"
                  checked={on}
                  onChange={() => toggleLevel(lvl)}
                />
                <span className="font-medium text-gray-800">{lvl}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Parts */}
      {ASSESSMENT_FORM.map((part) => {
        // Guard instead of a non-null assertion: a form/result key divergence
        // (e.g. a future ASSESSMENT_FORM edit) must not crash the whole page.
        const p = result.parts.find((x) => x.key === part.key);
        if (!p) return null;
        return (
          <div key={part.key} className="mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 pb-1">
              <h4 className="text-sm font-bold text-gray-900">{part.label}</h4>
              <span className="text-xs font-semibold text-indigo-700">
                {p.percent.toFixed(0)}% · {GRADE_LABEL[p.grade]}
              </span>
            </div>
            {/* Mobile: stacked criterion rows with tappable rating buttons (a
                5-column radio table only side-scrolls on a phone). */}
            <MobileCards>
              {part.subCategories.map((sub) => (
                <div key={sub.key} className="py-3">
                  <div className="text-xs font-semibold text-gray-700">
                    {sub.label} ({sub.weight}%){" "}
                    <span className="text-gray-400">· {subScore(sub.key).toFixed(1)}%</span>
                  </div>
                  <div className="mt-2 space-y-3">
                    {sub.criteria.map((c) => (
                      <div key={c.key}>
                        <div className="text-sm text-gray-700">{c.label}</div>
                        <div
                          className="mt-1.5 grid grid-cols-2 gap-2"
                          role="radiogroup"
                          aria-label={c.label}
                        >
                          {RATINGS.map((r) => (
                            <button
                              key={r}
                              type="button"
                              role="radio"
                              aria-checked={ratings[c.key] === r}
                              onClick={() => setRating(c.key, r)}
                              className={cn(
                                "min-h-11 rounded-lg border px-2 py-1.5 text-sm font-medium transition",
                                ratings[c.key] === r
                                  ? "border-indigo-600 bg-indigo-600 text-white"
                                  : "border-gray-200 bg-white text-gray-600 active:bg-gray-100",
                              )}
                            >
                              {RATING_LABELS[r]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </MobileCards>
            {/* Desktop: the original criterion × rating radio matrix. */}
            <DesktopTable>
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="py-1 text-left font-medium">Criterion</th>
                    {RATINGS.map((r) => (
                      <th key={r} className="px-2 py-1 text-center font-medium">
                        {RATING_LABELS[r]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {part.subCategories.map((sub) => (
                    <SubCategoryRows
                      key={sub.key}
                      label={`${sub.label} (${sub.weight}%)`}
                      score={subScore(sub.key)}
                      criteria={sub.criteria}
                      ratings={ratings}
                      onRate={setRating}
                    />
                  ))}
                </tbody>
              </table>
            </DesktopTable>
          </div>
        );
      })}

      {/* Final */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-indigo-50 px-4 py-2">
        <span className="text-sm font-bold text-indigo-900">Final score</span>
        <span className="text-sm font-bold text-indigo-900">
          {result.totalPercent.toFixed(1)}% · {GRADE_LABEL[result.finalGrade]}
        </span>
      </div>

      <div className="mt-3">
        <Label htmlFor="a-comments">Comments</Label>
        <Textarea id="a-comments" className="mt-1" rows={4} value={comments} onChange={(e) => setComments(e.target.value)} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save assessment
        </Button>
        <Button variant="ghost" onClick={reset} disabled={busy}>
          <RotateCcw className="h-4 w-4" /> Clear
        </Button>
      </div>
    </Card>
  );
}

function SubCategoryRows({
  label,
  score,
  criteria,
  ratings,
  onRate,
}: {
  label: string;
  score: number;
  criteria: { key: string; label: string }[];
  ratings: RatingMap;
  onRate: (key: string, r: Rating) => void;
}) {
  return (
    <>
      <tr className="bg-gray-50">
        <td colSpan={5} className="px-1 py-1.5 text-xs font-semibold text-gray-700">
          {label} <span className="text-gray-400">· {score.toFixed(1)}%</span>
        </td>
      </tr>
      {criteria.map((c) => (
        <tr key={c.key} className="border-t border-gray-100">
          <td className="py-1.5 pr-2 text-gray-700">{c.label}</td>
          {RATINGS.map((r) => (
            <td key={r} className="px-2 py-1.5 text-center">
              <input
                type="radio"
                name={c.key}
                className="h-4 w-4 accent-indigo-600"
                checked={ratings[c.key] === r}
                onChange={() => onRate(c.key, r)}
                aria-label={`${c.label}: ${RATING_LABELS[r]}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
