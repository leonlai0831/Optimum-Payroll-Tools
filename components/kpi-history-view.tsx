"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  History,
  Search,
} from "lucide-react";
import { Card, Input, Select } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import {
  TableToolbar,
  includesText,
  makeComparator,
  useSortState,
} from "@/components/table-controls";
import { DeleteRunButton } from "@/components/delete-run-button";
import type { RunSummary } from "@/lib/db/queries";
import { makeCenterNormalizer } from "@/lib/allowance/centers";
import { cn, formatDate, rm } from "@/lib/utils";

/** Sortable fields for the saved-month rows (toolbar dropdown — the accordion has no column headers). */
const ACCESSORS = {
  saved: (r: RunSummary) => new Date(r.createdAt).getTime(),
  period: (r: RunSummary) => r.periodLabel,
  payout: (r: RunSummary) => r.totalPayout,
  coaches: (r: RunSummary) => r.coachCount,
} as const;

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "saved-desc", label: "Newest saved" },
  { value: "saved-asc", label: "Oldest saved" },
  { value: "period-desc", label: "Period (newest)" },
  { value: "period-asc", label: "Period (oldest)" },
  { value: "payout-desc", label: "Highest payout" },
  { value: "coaches-desc", label: "Most coaches" },
];

/* Header action chrome — same 8px-outline utility buttons as the Saved
   Allowances month header, so the two histories read as siblings. */
const actionButtonClasses =
  "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold transition-colors";

export function KpiHistoryView({
  runs,
  canExport,
  canFinalize = false,
  savers,
  centers = [],
  centerAliases = {},
}: {
  runs: RunSummary[];
  canExport: boolean;
  /** finalize_kpi holders may also delete a saved month straight from the list. */
  canFinalize?: boolean;
  /** run id → last saver's name, for admins; null hides attribution. */
  savers: Record<number, string> | null;
  /** Operator center codes + aliases, to normalize stored center labels for display. */
  centers?: string[];
  centerAliases?: Record<string, string[]>;
}) {
  // Normalize stored (possibly raw) center labels onto the configured codes for display.
  const normCenter = useMemo(
    () => makeCenterNormalizer(centers, centerAliases),
    [centers, centerAliases],
  );
  const [q, setQ] = useState("");
  const { sort, setSort } = useSortState<keyof typeof ACCESSORS>({ key: "saved", dir: "desc" });
  // Months are collapsed; expand a period row to see its per-coach breakdown inline.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sorted = useMemo(() => {
    const filtered = runs.filter(
      (r) => includesText(r.periodLabel, q) || includesText(r.filename, q),
    );
    return [...filtered].sort(makeComparator(ACCESSORS, sort));
  }, [runs, q, sort]);

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No saved months yet"
        body="Upload a CSV on the Dashboard and click “Save month” to start building your history."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableToolbar className="border-b-0">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search period or file…"
            className="w-56 py-1.5 text-xs"
          />
          <Select
            value={sort ? `${sort.key}-${sort.dir}` : "saved-desc"}
            onChange={(e) => {
              const [key, dir] = e.target.value.split("-") as [
                keyof typeof ACCESSORS,
                "asc" | "desc",
              ];
              setSort({ key, dir });
            }}
            className="w-auto py-1.5 text-xs"
            aria-label="Sort saved months"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <span className="ml-auto text-xs text-gray-500">
            {sorted.length} of {runs.length}
          </span>
        </TableToolbar>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No saved months match the current filter"
          body="Try clearing the search or widening it."
        />
      ) : (
        sorted.map((r) => {
          const open = expanded.has(r.id);
          const isDraft = r.status === "draft";
          return (
            <Card key={r.id} className="overflow-hidden">
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 bg-gray-50 px-4 py-2",
                  open && "border-b border-gray-100",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  aria-expanded={open}
                  className="flex min-h-11 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
                  title={open ? "Collapse month" : "Expand month"}
                >
                  <span className="inline-flex items-center gap-2">
                    {open ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                    )}
                    <span className="font-semibold text-gray-900">{r.periodLabel}</span>
                    {isDraft ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        <Clock className="h-3 w-3" /> Draft
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                        <CheckCircle2 className="h-3 w-3" /> Finalized
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-500">
                    {r.coachCount} coach(es) · total {rm(r.totalPayout)} · {r.filename}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    saved {formatDate(r.createdAt)}
                    {savers && <> · by {savers[r.id] ?? "—"}</>}
                  </span>
                </button>
                {/* Phones: actions drop to their own full-width row under the
                    summary (44px-friendly); lg+ keeps them right-aligned. */}
                <div className="flex w-full items-center gap-2 pl-6 lg:w-auto lg:pl-0">
                  {canExport && (
                    <a
                      href={`/api/runs/${r.id}/summary`}
                      className={cn(
                        actionButtonClasses,
                        "text-gray-700 hover:bg-gray-50 active:bg-gray-100",
                      )}
                      title="Download all-coach summary CSV"
                    >
                      <Download className="h-3.5 w-3.5" /> CSV
                    </a>
                  )}
                  <Link
                    href={`/kpi/history/${r.id}`}
                    className={cn(
                      actionButtonClasses,
                      "text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100",
                    )}
                  >
                    {isDraft ? "Review" : "View"}
                  </Link>
                  {canFinalize && <DeleteRunButton id={r.id} compact />}
                </div>
              </div>

              {open &&
                (r.coaches.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-500">
                    No coaches recorded for this month.
                  </p>
                ) : (
                  <>
                    {/* Mobile (< lg): compact per-coach cards. */}
                    <MobileCards>
                      <div className="p-4">
                        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50/60">
                          {r.coaches.map((c, ci) => (
                            <div key={`${c.canonicalName}|${ci}`} className="px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium text-gray-900">
                                  {c.canonicalName}
                                  {!c.isComplete && (
                                    <span className="ml-1.5 text-[10px] text-amber-600">
                                      incomplete
                                    </span>
                                  )}
                                </span>
                                <span className="flex shrink-0 items-baseline gap-1.5">
                                  <span className="nums text-sm font-bold text-indigo-600">
                                    {c.finalScore.toFixed(2)}
                                  </span>
                                  <span className="text-xs font-semibold text-gray-700">
                                    {c.grade}
                                  </span>
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                                <span className="truncate">
                                  {normCenter(c.center) || "—"} · {c.position} · {c.students}{" "}
                                  students
                                </span>
                                <span className="nums shrink-0">
                                  {c.teachingAllowance ? `${rm(c.teachingAllowance)} → ` : ""}
                                  <span className="font-medium text-green-700">
                                    {rm(c.payout)}
                                  </span>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </MobileCards>

                    {/* Desktop (lg+): the per-coach breakdown table. */}
                    <DesktopTable className="bg-gray-50/60 px-4 py-3">
                      <table className="min-w-full text-xs">
                        <thead className="text-[11px] uppercase tracking-wide text-gray-400">
                          <tr>
                            <th className="px-2 py-1 text-left font-medium">Coach</th>
                            <th className="px-2 py-1 text-left font-medium">Center</th>
                            <th className="px-2 py-1 text-center font-medium">Students</th>
                            <th className="px-2 py-1 text-left font-medium">Position</th>
                            <th className="px-2 py-1 text-center font-medium">Score</th>
                            <th className="px-2 py-1 text-center font-medium">Grade</th>
                            <th className="px-2 py-1 text-right font-medium">Allowance</th>
                            <th className="px-2 py-1 text-right font-medium">Payout</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {r.coaches.map((c, ci) => (
                            <tr key={`${c.canonicalName}|${ci}`}>
                              <td className="px-2 py-1 font-medium text-gray-900">
                                {c.canonicalName}
                                {!c.isComplete && (
                                  <span className="ml-1.5 text-[10px] text-amber-600">
                                    incomplete
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-gray-500">
                                {normCenter(c.center) || "—"}
                              </td>
                              <td className="px-2 py-1 text-center text-gray-600">{c.students}</td>
                              <td className="px-2 py-1 text-gray-600">{c.position}</td>
                              <td className="px-2 py-1 text-center font-bold text-indigo-600">
                                {c.finalScore.toFixed(2)}
                              </td>
                              <td className="px-2 py-1 text-center text-gray-700">{c.grade}</td>
                              <td className="px-2 py-1 text-right text-gray-600">
                                {c.teachingAllowance ? rm(c.teachingAllowance) : "—"}
                              </td>
                              <td className="px-2 py-1 text-right font-medium text-green-700">
                                {rm(c.payout)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </DesktopTable>
                  </>
                ))}
            </Card>
          );
        })
      )}
    </div>
  );
}
