"use client";

import { useState } from "react";
import { HeartHandshake, Info, Sparkles } from "lucide-react";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { fetchJson } from "@/lib/http";
import { cn } from "@/lib/utils";

interface Watch {
  name: string;
  level: "watch" | "elevated";
  direction: "declining" | "volatile";
  changeFromPeak: number;
  reasons: string[];
}

/**
 * Supportive "check-in" view built on the deterministic, transparent retention
 * signals. By design this is NOT an attrition predictor: the prominent notice
 * and supportive framing are intentional, and every flag shows the exact KPI
 * numbers behind it. Run on demand by management (swim_view_staff).
 */
export function RetentionView() {
  const [data, setData] = useState<{ watch: Watch[]; summary: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await fetchJson<{ watch?: Watch[]; summary?: string }>("/api/retention");
      setData({ watch: d.watch ?? [], summary: d.summary ?? "" });
    } catch {
      setData({ watch: [], summary: "Could not load this right now." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <HeartHandshake className="h-4 w-4 text-accent" /> Supportive check-in suggestions
        </span>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? "Loading…" : data ? "Refresh" : "Show"}
        </Button>
      </div>

      <div className="mt-2 flex items-start gap-1.5 rounded-md bg-indigo-50/70 p-2 text-[11px] leading-relaxed text-indigo-700">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Based <strong>only on KPI score trends</strong> — this is <strong>not</strong> a prediction
          that anyone will leave, and must never drive an employment decision. It simply highlights
          coaches whose scores have dipped, so you can offer support. Every flag shows the exact
          numbers behind it.
        </span>
      </div>

      {data && (
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-relaxed text-gray-800">{data.summary}</p>
          {data.watch.length > 0 ? (
            <ul className="space-y-2">
              {data.watch.map((w) => (
                <li key={w.name} className="rounded-md border border-gray-100 p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{w.name}</span>
                    <Badge
                      className={cn(
                        w.level === "elevated"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-600",
                      )}
                    >
                      {w.level}
                    </Badge>
                  </div>
                  <ul className="mt-1 list-inside list-disc text-xs text-gray-600">
                    {w.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">No coaches show a declining KPI trend right now.</p>
          )}
        </div>
      )}
    </Card>
  );
}
