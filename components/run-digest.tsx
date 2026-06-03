"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { Spinner } from "@/components/ui";

interface DigestCoach {
  name: string;
  finalScore: number;
  grade: string;
  payout: number;
}

/**
 * On-demand AI monthly digest for a finalized run. Posts the coach results to
 * /api/summary (which degrades to a template without ANTHROPIC_API_KEY) and
 * shows the prose. Generated on click, not on load, so we don't spend a model
 * call every time the page is viewed.
 */
export function RunDigest({ period, coaches }: { period: string; coaches: DigestCoach[] }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, coaches }),
      });
      const d = (await res.json()) as { text?: string };
      setText(d.text ?? "");
    } catch {
      setText("Could not generate a summary right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-indigo-900">
          <Sparkles className="h-4 w-4 text-accent" /> Monthly digest
        </span>
        {text === null && (
          <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
            {loading ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {loading ? "Generating…" : "Generate"}
          </Button>
        )}
      </div>
      {text !== null && (
        <p className="mt-2 text-sm leading-relaxed text-gray-800">{text}</p>
      )}
    </div>
  );
}
