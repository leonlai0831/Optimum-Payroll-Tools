"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge, Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

interface Finding {
  coach: string;
  severity: "high" | "medium" | "low";
  message: string;
}

/**
 * On-demand bonus/allowance audit for a finalized run. The findings are computed
 * deterministically server-side (lib/kpi/audit.ts); this just renders them plus
 * the AI summary. Run on click so we don't audit on every page view.
 */
export function RunAudit({ runId }: { runId: number }) {
  const [data, setData] = useState<{ findings: Finding[]; summary: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/audit`);
      const d = (await res.json()) as { findings?: Finding[]; summary?: string };
      setData({ findings: d.findings ?? [], summary: d.summary ?? "" });
    } catch {
      setData({ findings: [], summary: "Could not run the audit right now." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
          <ShieldCheck className="h-4 w-4" /> Bonus audit
        </span>
        {data === null && (
          <Button size="sm" variant="outline" onClick={run} disabled={loading}>
            {loading ? <Spinner className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {loading ? "Auditing…" : "Run audit"}
          </Button>
        )}
      </div>

      {data && (
        <div className="mt-2 space-y-2">
          <p className="text-sm leading-relaxed text-gray-800">{data.summary}</p>
          {data.findings.length > 0 && (
            <ul className="space-y-1">
              {data.findings.map((f, i) => (
                <li key={`${f.coach}-${i}`} className="flex items-start gap-1.5 text-sm text-gray-700">
                  <Badge
                    className={cn(
                      "mt-0.5 shrink-0",
                      f.severity === "high"
                        ? "bg-rose-200 text-rose-900"
                        : f.severity === "medium"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-600",
                    )}
                  >
                    {f.severity}
                  </Badge>
                  <span>
                    <strong>{f.coach}</strong> — {f.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {data.findings.length === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> No discrepancies found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
