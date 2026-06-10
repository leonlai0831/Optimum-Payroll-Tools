"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { useToast } from "@/components/toast";
import { Button, Spinner } from "@/components/ui";
import type { RunCoach } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "kpi-hong-li-2026-04.pdf" — safe cross-platform download name. */
function pdfFilename(name: string, periodLabel: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "coach";
  return `kpi-${slug}-${periodLabel}.pdf`;
}

/**
 * "PDF" button for the per-coach result drawers (live leaderboard + saved run).
 * Builds the coach-result PDF in the browser from the already-rendered coach
 * object — no server round-trip — and triggers a download.
 */
export function CoachResultPdfButton({
  coach,
  periodLabel,
  className,
}: {
  coach: RunCoach;
  periodLabel: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function download() {
    setBusy(true);
    try {
      // Lazy-load pdf-lib (+ builder) only when a PDF is actually requested.
      const { buildCoachResultPdf } = await import("@/lib/reports/coach-result");
      const bytes = await buildCoachResultPdf({ coach, periodLabel });
      const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = pdfFilename(coach.canonicalName, periodLabel);
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to build PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      className={cn("min-h-11", className)}
      onClick={download}
      disabled={busy}
      aria-label={`Download ${coach.canonicalName} KPI result as PDF`}
    >
      {busy ? <Spinner /> : <FileDown className="h-4 w-4" />} PDF
    </Button>
  );
}
