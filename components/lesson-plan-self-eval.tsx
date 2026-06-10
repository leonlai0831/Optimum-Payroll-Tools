"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck, Pencil, Save } from "lucide-react";
import { Button, Card, Label, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import type { SelfEvalAnswer } from "@/lib/lesson-plan/types";
import { SELF_EVAL_GROUPS } from "@/lib/lesson-plan/templates";

/**
 * The "Post-lesson self-evaluation" card on a plan's detail page (replacement
 * plans only). The 16 yes/no questions + remarks are filled AFTER the class —
 * separate from the pre-class plan content, so saving here never changes the
 * review status. Unfilled → empty state with a Fill button for the creator
 * (once the plan is approved or the lesson date has passed); filled → the
 * answers + remarks + a "Completed" stamp, re-editable by the creator.
 */
export function LessonPlanSelfEval({
  planId,
  canFill,
  selfEval,
  remarks,
  selfEvalAt,
}: {
  planId: number;
  /** Creator + the plan is approved or its lesson date has passed. */
  canFill: boolean;
  selfEval: Record<string, SelfEvalAnswer>;
  remarks: string;
  /** ISO timestamp of the last fill; null = not filled yet. */
  selfEvalAt: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftEval, setDraftEval] = useState<Record<string, SelfEvalAnswer>>(selfEval);
  const [draftRemarks, setDraftRemarks] = useState(remarks);

  const filled = selfEvalAt !== null;

  function openEditor() {
    setDraftEval(selfEval);
    setDraftRemarks(remarks);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/lesson-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "self_eval", selfEval: draftEval, remarks: draftRemarks }),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(out.error || "Save failed");
      toast.success("Self-evaluation saved.");
      setEditing(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h3 text-gray-900">
          <ClipboardCheck className="h-4 w-4 text-indigo-500" />
          Post-lesson self-evaluation
        </h3>
        {filled && !editing && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Completed {new Date(selfEvalAt!).toLocaleDateString()}
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-3">
          {SELF_EVAL_GROUPS.map((group) => (
            <div key={group.key} className="mt-3 first:mt-0">
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {group.title}
              </div>
              <div className="mt-1 divide-y divide-gray-100">
                {group.questions.map((q) => (
                  <div key={q.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 flex-1 text-sm text-gray-700">{q.label}</span>
                    <div className="flex shrink-0 gap-2" role="radiogroup" aria-label={q.label}>
                      {(["yes", "no"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          role="radio"
                          aria-checked={draftEval[q.key] === a}
                          onClick={() =>
                            setDraftEval((prev) => ({
                              ...prev,
                              [q.key]: prev[q.key] === a ? "" : a,
                            }))
                          }
                          className={cn(
                            "min-h-11 min-w-14 rounded-lg border px-3 text-sm font-semibold transition",
                            draftEval[q.key] === a
                              ? "border-indigo-600 bg-indigo-600 text-white"
                              : "border-gray-200 bg-white text-gray-600 active:bg-gray-100",
                          )}
                        >
                          {a === "yes" ? "Yes" : "No"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-4">
            <Label htmlFor="lp-se-remarks">Remarks</Label>
            <Textarea
              id="lp-se-remarks"
              className="mt-1"
              rows={3}
              value={draftRemarks}
              onChange={(e) => setDraftRemarks(e.target.value)}
              placeholder="How did the class go?"
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save self-evaluation
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : filled ? (
        <div className="mt-1">
          {SELF_EVAL_GROUPS.map((group) => (
            <div key={group.key} className="mt-3">
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {group.title}
              </div>
              <div className="mt-1 divide-y divide-gray-100">
                {group.questions.map((q) => {
                  const a = selfEval[q.key];
                  return (
                    <div
                      key={q.key}
                      className="flex items-center justify-between gap-3 py-1.5 text-sm"
                    >
                      <span className="min-w-0 text-gray-700">{q.label}</span>
                      <span
                        className={
                          a === "yes"
                            ? "shrink-0 font-semibold text-green-700"
                            : a === "no"
                              ? "shrink-0 font-semibold text-gray-900"
                              : "shrink-0 text-gray-300"
                        }
                      >
                        {a === "yes" ? "Yes" : a === "no" ? "No" : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="mt-3">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Remarks</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{remarks || "—"}</p>
          </div>
          {canFill && (
            <Button variant="outline" className="mt-4" onClick={openEditor} disabled={busy}>
              <Pencil className="h-4 w-4" /> Edit self-evaluation
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-gray-500">Fill this in after the class has been taught.</p>
          {canFill && (
            <Button className="mt-3" onClick={openEditor} disabled={busy}>
              <ClipboardCheck className="h-4 w-4" /> Fill self-evaluation
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
