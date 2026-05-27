"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Save, Star, Trash2, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner, Textarea } from "@/components/ui";
import {
  RATING_MAX,
  RATING_MIN,
  overallFromRatings,
  type AppraisalDimension,
  type AppraisalRating,
} from "@/lib/performance/types";

export interface AppraisalView {
  id: number;
  periodLabel: string;
  reviewDate: string;
  reviewedBy: string;
  ratings: AppraisalRating[];
  overallScore: number;
  comments: string;
}

const SCORES = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MIN + i);

export function AppraisalsSection({
  coachId,
  appraisals,
  dimensions,
  canEdit,
}: {
  coachId: number;
  appraisals: AppraisalView[];
  dimensions: AppraisalDimension[];
  canEdit: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-indigo-700">
          <ClipboardList className="h-4 w-4" /> Appraisals
        </h3>
      </div>

      {canEdit && <AddAppraisal coachId={coachId} dimensions={dimensions} />}

      {appraisals.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">No appraisals yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {appraisals.map((a) => (
            <AppraisalCard key={a.id} appraisal={a} canEdit={canEdit} />
          ))}
        </div>
      )}
    </Card>
  );
}

function AddAppraisal({
  coachId,
  dimensions,
}: {
  coachId: number;
  dimensions: AppraisalDimension[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [periodLabel, setPeriodLabel] = useState("");
  const [reviewDate, setReviewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ratings: AppraisalRating[] = dimensions.map((d) => ({
    key: d.key,
    label: d.label,
    score: scores[d.key] ?? 3,
  }));
  const overall = overallFromRatings(ratings);

  function reset() {
    setPeriodLabel("");
    setReviewDate(new Date().toISOString().slice(0, 10));
    setScores({});
    setComments("");
    setError("");
  }

  async function submit() {
    if (dimensions.length === 0) {
      setError("Add appraisal dimensions in Options first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/staff/${coachId}/appraisals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLabel,
          reviewDate,
          comments,
          ratings: ratings.map((r) => ({ key: r.key, score: r.score })),
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add appraisal
      </Button>
    );
  }

  return (
    <Card className="border-indigo-100 bg-indigo-50/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-900">New appraisal</span>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-gray-400 hover:text-gray-600"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="ap-period">Period label</Label>
          <Input
            id="ap-period"
            className="mt-1"
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            placeholder="e.g. 2026 H1"
          />
        </div>
        <div>
          <Label htmlFor="ap-date">Review date</Label>
          <Input
            id="ap-date"
            type="date"
            className="mt-1"
            value={reviewDate}
            onChange={(e) => setReviewDate(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {dimensions.map((d) => (
          <div key={d.key} className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-700">{d.label}</span>
            <Select
              className="w-20 py-1 text-xs"
              value={scores[d.key] ?? 3}
              onChange={(e) => setScores((s) => ({ ...s, [d.key]: Number(e.target.value) }))}
            >
              {SCORES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Label htmlFor="ap-comments">Comments</Label>
        <Textarea
          id="ap-comments"
          className="mt-1"
          rows={3}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Optional notes for this appraisal"
        />
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={submit} disabled={busy}>
          {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save appraisal
        </Button>
        <span className="text-sm text-gray-500">
          Overall: <span className="font-bold text-gray-900">{overall}</span> / 100
        </span>
      </div>
    </Card>
  );
}

function AppraisalCard({ appraisal, canEdit }: { appraisal: AppraisalView; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Delete this appraisal?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/appraisals/${appraisal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold text-brand">{appraisal.overallScore}</span>
            <span className="text-xs text-gray-400">/ 100</span>
            {appraisal.periodLabel && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {appraisal.periodLabel}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {new Date(appraisal.reviewDate).toLocaleDateString()}
            {appraisal.reviewedBy ? ` · by ${appraisal.reviewedBy}` : ""}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={remove}
            disabled={busy}
            className="text-gray-300 transition hover:text-red-500 disabled:opacity-40"
            title="Delete appraisal"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {appraisal.ratings.map((r) => (
          <span
            key={r.key}
            className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-600"
          >
            {r.label}
            <span className="inline-flex items-center gap-0.5 font-semibold text-gray-900">
              {r.score}
              <Star className="h-3 w-3 text-amber-400" />
            </span>
          </span>
        ))}
      </div>

      {appraisal.comments && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{appraisal.comments}</p>
      )}
    </div>
  );
}
