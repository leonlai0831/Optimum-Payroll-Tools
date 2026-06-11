"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { SearchableSelect } from "@/components/searchable-select";
import { useToast } from "@/components/toast";
import type { InstructorOption } from "@/components/assessment-form";

/** AI read of an instructor's latest assessment. Template fallback without a key. */
export function AssessmentAi({ instructors }: { instructors: InstructorOption[] }) {
  const toast = useToast();
  const [coachId, setCoachId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const name = instructors.find((i) => i.id === coachId)?.name;

  async function analyze() {
    if (coachId == null) {
      toast.error("Select an instructor first.");
      return;
    }
    setLoading(true);
    setText(null);
    try {
      const res = await fetch("/api/assessments/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setText(data.text ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <h3 className="flex items-center gap-2 text-h3 text-gray-900">
        <Sparkles className="h-4 w-4 text-accent" /> AI analysis
      </h3>
      <p className="text-sm text-gray-500">
        Pick an instructor for an AI read of their latest assessment — strengths, gaps, and a
        development focus. Falls back to a template summary when no AI key is set.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect
          className="w-56"
          placeholder={name ?? "Select instructor…"}
          searchPlaceholder="Search instructor…"
          options={instructors.map((i) => ({ value: String(i.id), label: i.name }))}
          onSelect={(v) => {
            setCoachId(Number(v));
            setText(null);
          }}
        />
        <Button onClick={analyze} disabled={loading || coachId == null}>
          <Sparkles className="h-4 w-4" /> Analyze
        </Button>
      </div>
      {loading && <Skeleton className="h-16 w-full" />}
      {text && !loading && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-sm leading-relaxed text-gray-800">
          {text}
        </div>
      )}
    </Card>
  );
}
