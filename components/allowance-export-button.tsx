"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui";
import type { AllowanceRunSummary } from "@/lib/db/queries";

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** Download a whole month's allowance breakdown as a CSV (opens in Excel) for HR. */
export function AllowanceExportButton({
  period,
  rows,
}: {
  period: string;
  rows: AllowanceRunSummary[];
}) {
  function exportCsv() {
    const maxOther = rows.reduce((m, r) => Math.max(m, r.otherItems.length), 0);
    const idx = Array.from({ length: maxOther }, (_, i) => i);
    const baseHeaders = [
      "Period",
      "Staff",
      "Position",
      "Center",
      "Op hours",
      "Leave hours",
      "Attendance %",
      "Attendance (RM)",
      "Teaching (RM)",
      "Other (RM)",
    ];
    const otherHeaders = idx.flatMap((i) => [
      `Other ${i + 1} Center`,
      `Other ${i + 1} Reason`,
      `Other ${i + 1} (RM)`,
    ]);
    const headers = [...baseHeaders, ...otherHeaders, "Grand total (RM)"];
    const lines = rows.map((r) => {
      const base = [
        r.periodLabel,
        csvCell(r.canonicalName),
        r.tier,
        csvCell(r.center ?? ""),
        r.opHours,
        r.leaveHours,
        (r.attendancePct * 100).toFixed(2),
        Math.round(r.attendance),
        Math.round(r.teaching),
        Math.round(r.other),
      ];
      const other = idx.flatMap((i) => {
        const it = r.otherItems[i];
        return it
          ? [csvCell(it.center || ""), csvCell(it.reason || ""), Math.round(it.amount)]
          : ["", "", ""];
      });
      return [...base, ...other, Math.round(r.grandTotal)].join(",");
    });
    const sum = (pick: (r: AllowanceRunSummary) => number) =>
      Math.round(rows.reduce((s, r) => s + pick(r), 0));
    const totals = [
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      sum((r) => r.attendance),
      sum((r) => r.teaching),
      sum((r) => r.other),
      ...idx.flatMap(() => ["", "", ""]),
      sum((r) => r.grandTotal),
    ].join(",");
    // Lead with a UTF-8 BOM so Excel reads the encoding correctly.
    const csv = "\uFEFF" + [headers.join(","), ...lines, totals].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Allowance_${period}.csv`;
    link.click();
  }

  return (
    <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={exportCsv}>
      <Download className="h-3.5 w-3.5" /> Export {period} (CSV)
    </Button>
  );
}
