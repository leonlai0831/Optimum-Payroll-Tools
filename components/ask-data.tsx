"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";

const SUGGESTIONS = [
  "Who improved the most over the last few months?",
  "Which coach had the highest payout overall?",
  "Who has been declining recently?",
];

/**
 * Ask a natural-language question about the saved KPI data. The server builds a
 * compact summary of the runs and Claude answers over that (it never queries the
 * DB directly), so answers stay grounded in real saved data.
 */
export function AskData() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    setQ(text);
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const d = (await res.json()) as { text?: string };
      setAnswer(d.text ?? "");
    } catch {
      setAnswer("Could not answer that right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <Sparkles className="h-4 w-4 text-accent" /> Ask about your data
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. who improved the most this year?"
          className="flex-1 text-sm"
        />
        <Button type="submit" size="sm" disabled={loading || !q.trim()}>
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          Ask
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void ask(s)}
            className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 hover:bg-gray-50"
          >
            {s}
          </button>
        ))}
      </div>
      {answer !== null && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{answer}</p>
      )}
    </Card>
  );
}
