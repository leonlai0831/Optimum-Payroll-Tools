"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Badge, Card, Input } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { SortTh, TableToolbar, includesText, useTableSort } from "@/components/table-controls";
import type { RunSummary } from "@/lib/db/queries";
import { makeCenterNormalizer } from "@/lib/allowance/centers";
import { rm } from "@/lib/utils";

export function KpiHistoryView({
  runs,
  canExport,
  savers,
  centers = [],
  centerAliases = {},
}: {
  runs: RunSummary[];
  canExport: boolean;
  /** run id → last saver's name, for admins; null hides the column. */
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
  // Months are collapsed; click a row to expand its per-coach result inline.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(
    () => runs.filter((r) => includesText(r.periodLabel, q) || includesText(r.filename, q)),
    [runs, q],
  );

  const { sorted, sort, toggleSort } = useTableSort(filtered, {
    period: (r) => r.periodLabel,
    file: (r) => r.filename,
    coaches: (r) => r.coachCount,
    payout: (r) => r.totalPayout,
    saved: (r) => new Date(r.createdAt).getTime(),
  });

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
    <Card className="overflow-hidden">
      <TableToolbar>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search period or file…"
          className="w-56 py-1.5 text-xs"
        />
        <span className="ml-auto text-xs text-gray-500">
          {sorted.length} of {runs.length}
        </span>
      </TableToolbar>

      {/* Mobile (< lg): one card per saved month with explicit tap targets. */}
      <MobileCards>
        {sorted.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            No saved months match the current filter.
          </div>
        ) : (
          sorted.map((r) => {
            const open = expanded.has(r.id);
            return (
              <div key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{r.periodLabel}</div>
                    <div className="mt-0.5 break-words text-[11px] text-gray-400">
                      {r.filename} · saved {new Date(r.createdAt).toLocaleDateString()}
                      {savers && <> · by {savers[r.id] ?? "—"}</>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {r.status === "draft" ? (
                      <Badge className="border-amber-300 bg-amber-100 text-amber-800">
                        Pending review
                      </Badge>
                    ) : (
                      <Badge className="border-green-300 bg-green-100 text-green-800">
                        Finalized
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-overline text-muted">Coaches</span>
                    <div className="nums mt-0.5 text-sm font-medium text-gray-700">
                      {r.coachCount}
                    </div>
                  </div>
                  <div>
                    <span className="text-overline text-muted">Total payout</span>
                    <div className="nums mt-0.5 text-base font-bold text-green-700">
                      {rm(r.totalPayout)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-md border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                    onClick={() => toggle(r.id)}
                    aria-expanded={open}
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    Coaches
                  </button>
                  {canExport && (
                    <a
                      href={`/api/runs/${r.id}/summary`}
                      className="flex min-h-11 items-center justify-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100"
                      title="Download all-coach summary CSV"
                    >
                      CSV
                    </a>
                  )}
                  <Link
                    href={`/kpi/history/${r.id}`}
                    className="flex min-h-11 flex-1 items-center justify-center rounded-md border border-gray-200 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100"
                  >
                    {r.status === "draft" ? "Review" : "View"}
                  </Link>
                </div>

                {open &&
                  (r.coaches.length === 0 ? (
                    <p className="mt-3 text-xs text-gray-500">
                      No coaches recorded for this month.
                    </p>
                  ) : (
                    <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50/60">
                      {r.coaches.map((c) => (
                        <div key={c.canonicalName} className="px-3 py-2.5">
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
                              {normCenter(c.center) || "—"} · {c.position} · {c.students} students
                            </span>
                            <span className="nums shrink-0">
                              {c.teachingAllowance ? `${rm(c.teachingAllowance)} → ` : ""}
                              <span className="font-medium text-green-700">{rm(c.payout)}</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            );
          })
        )}
      </MobileCards>

      {/* Desktop (lg+): sortable table with inline expansion. */}
      <DesktopTable>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <SortTh label="Period" sortKey="period" sort={sort} onSort={toggleSort} />
              <th className="px-4 py-2 text-left">Status</th>
              <SortTh label="File" sortKey="file" sort={sort} onSort={toggleSort} />
              <SortTh label="Coaches" sortKey="coaches" sort={sort} onSort={toggleSort} align="center" />
              <SortTh label="Total Payout" sortKey="payout" sort={sort} onSort={toggleSort} align="right" />
              <SortTh label="Saved" sortKey="saved" sort={sort} onSort={toggleSort} />
              {savers && <th className="px-4 py-2 text-left">Saved by</th>}
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={savers ? 8 : 7} className="px-4 py-8 text-center text-sm text-gray-500">
                  No saved months match the current filter.
                </td>
              </tr>
            ) : (
              sorted.map((r) => {
                const open = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <tr
                      className="cursor-pointer hover:bg-indigo-50/40"
                      onClick={() => toggle(r.id)}
                      tabIndex={0}
                      role="button"
                      aria-expanded={open}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          if (e.key === " ") e.preventDefault();
                          toggle(r.id);
                        }
                      }}
                    >
                      <td className="px-4 py-2 font-semibold text-gray-900">
                        <span className="inline-flex items-center gap-1.5">
                          {open ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                          )}
                          {r.periodLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {r.status === "draft" ? (
                          <Badge className="border-amber-300 bg-amber-100 text-amber-800">
                            Pending review
                          </Badge>
                        ) : (
                          <Badge className="border-green-300 bg-green-100 text-green-800">
                            Finalized
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{r.filename}</td>
                      <td className="px-4 py-2 text-center text-gray-600">{r.coachCount}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-700">
                        {rm(r.totalPayout)}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      {savers && <td className="px-4 py-2 text-gray-500">{savers[r.id] ?? "—"}</td>}
                      <td className="px-4 py-2 text-right">
                        <div
                          className="flex items-center justify-end gap-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canExport && (
                            <a
                              href={`/api/runs/${r.id}/summary`}
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                              title="Download all-coach summary CSV"
                            >
                              CSV
                            </a>
                          )}
                          <Link
                            href={`/kpi/history/${r.id}`}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            {r.status === "draft" ? "Review" : "View"}
                          </Link>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td
                          colSpan={savers ? 8 : 7}
                          className="border-t border-indigo-100 bg-gray-50/60 px-4 py-3"
                        >
                          {r.coaches.length === 0 ? (
                            <p className="text-xs text-gray-500">No coaches recorded for this month.</p>
                          ) : (
                            <div className="overflow-x-auto">
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
                                  {r.coaches.map((c) => (
                                    <tr key={c.canonicalName}>
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
                                      <td className="px-2 py-1 text-center text-gray-600">
                                        {c.students}
                                      </td>
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
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </DesktopTable>
    </Card>
  );
}
