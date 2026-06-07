"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, RotateCcw, Save } from "lucide-react";
import { Button, Card, Input, Label, Spinner, Textarea } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { useToast } from "@/components/toast";
import {
  ASSESSMENT_FORM,
  GRADE_LABEL,
  RATINGS,
  RATING_LABELS,
  type Rating,
  type RatingMap,
} from "@/lib/assessment/types";
import { computeAssessment } from "@/lib/assessment/calc";

/** An instructor the form can be filed against. */
export interface InstructorOption {
  id: number;
  name: string;
}

/**
 * The instructor observation form — the default landing of the assessment
 * module. Pick the instructor from a searchable dropdown, rate each criterion on
 * the 4-point scale (scores recompute live), add comments, and save. The server
 * recomputes + snapshots the score, which feeds that instructor's KPI Mgmt %.
 */
export function AssessmentForm({
  instructors,
  assessorDefault,
}: {
  instructors: InstructorOption[];
  assessorDefault: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [coachId, setCoachId] = useState<number | null>(null);
  const [classType, setClassType] = useState("");
  const [poolType, setPoolType] = useState("");
  const [pax, setPax] = useState("");
  const [assessor, setAssessor] = useState(assessorDefault);
  const [observedOn, setObservedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [ratings, setRatings] = useState<RatingMap>({});
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);

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
    setPax("");
    setObservedOn(new Date().toISOString().slice(0, 10));
    setRatings({});
    setComments("");
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
          assessor: assessor.trim(),
          classType: classType.trim(),
          poolType: poolType.trim(),
          pax: pax.trim() ? Number(pax) : null,
          ratings,
          comments: comments.trim(),
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
            onSelect={(v) => setCoachId(Number(v))}
          />
        </div>
        <div>
          <Label htmlFor="a-class">Class type / Level</Label>
          <Input id="a-class" className="mt-1" value={classType} onChange={(e) => setClassType(e.target.value)} placeholder="LVL 1" />
        </div>
        <div>
          <Label htmlFor="a-pool">Pool type</Label>
          <Input id="a-pool" className="mt-1" value={poolType} onChange={(e) => setPoolType(e.target.value)} placeholder="Big pool" />
        </div>
        <div>
          <Label htmlFor="a-pax">No. of pax</Label>
          <Input id="a-pax" type="number" min={0} className="mt-1" value={pax} onChange={(e) => setPax(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="a-assessor">Assessor</Label>
          <Input id="a-assessor" className="mt-1" value={assessor} onChange={(e) => setAssessor(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="a-date">Date</Label>
          <Input id="a-date" type="date" className="mt-1" value={observedOn} onChange={(e) => setObservedOn(e.target.value)} />
        </div>
      </div>

      {/* Parts */}
      {ASSESSMENT_FORM.map((part) => {
        const p = result.parts.find((x) => x.key === part.key)!;
        return (
          <div key={part.key} className="mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 pb-1">
              <h4 className="text-sm font-bold text-gray-900">{part.label}</h4>
              <span className="text-xs font-semibold text-indigo-700">
                {p.percent.toFixed(0)}% · {GRADE_LABEL[p.grade]}
              </span>
            </div>
            <div className="overflow-x-auto">
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
            </div>
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
