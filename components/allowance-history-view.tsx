"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Input, Select } from "@/components/ui";
import { AllowanceExportButton } from "@/components/allowance-export-button";
import {
  SortTh,
  TableToolbar,
  includesText,
  makeComparator,
  useSortState,
} from "@/components/table-controls";
import type { AllowanceRunSummary } from "@/lib/db/queries";
import { rm } from "@/lib/utils";

/** Centers are stored as one comma-joined string; the history table shows them in up to 3 columns. */
function splitCenters(center: string | null | undefined): string[] {
  return (center ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

const ACCESSORS = {
  staff: (r: AllowanceRunSummary) => r.canonicalName,
  position: (r: AllowanceRunSummary) => r.tier ?? "",
  center1: (r: AllowanceRunSummary) => splitCenters(r.center)[0] ?? "",
  center2: (r: AllowanceRunSummary) => splitCenters(r.center)[1] ?? "",
  center3: (r: AllowanceRunSummary) => splitCenters(r.center)[2] ?? "",
  attendance: (r: AllowanceRunSummary) => r.attendance,
  teaching: (r: AllowanceRunSummary) => r.teaching,
  other: (r: AllowanceRunSummary) => r.other,
  total: (r: AllowanceRunSummary) => r.grandTotal,
} as const;

export function AllowanceHistoryView({ rows }: { rows: AllowanceRunSummary[] }) {
  const [q, setQ] = useState("");
  const [centerFilter, setCenterFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const { sort, toggleSort } = useSortState<keyof typeof ACCESSORS>();

  const centerOptions = useMemo(
    () => [...new Set(rows.flatMap((r) => splitCenters(r.center)))].sort(),
    [rows],
  );
  const positionOptions = useMemo(
    () => [...new Set(rows.map((r) => r.tier).filter(Boolean))].sort(),
    [rows],
  );

  const periodOrder = useMemo(() => [...new Set(rows.map((r) => r.periodLabel))], [rows]);

  const groups = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (!includesText(r.canonicalName, q)) return false;
      if (centerFilter && !splitCenters(r.center).includes(centerFilter)) return false;
      if (positionFilter && r.tier !== positionFilter) return false;
      return true;
    });
    const byPeriod = new Map<string, AllowanceRunSummary[]>();
    for (const r of filtered) {
      const list = byPeriod.get(r.periodLabel) ?? [];
      list.push(r);
      byPeriod.set(r.periodLabel, list);
    }
    const compare = makeComparator(ACCESSORS, sort);
    return periodOrder
      .map((p) => byPeriod.get(p))
      .filter((list): list is AllowanceRunSummary[] => !!list && list.length > 0)
      .map((list) => [...list].sort(compare));
  }, [rows, q, centerFilter, positionFilter, sort, periodOrder]);

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-gray-500">
        No allowances saved yet. Compute one on the Calculator tab and click “Save”.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <TableToolbar className="border-b-0">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search staff…"
            className="w-44 py-1.5 text-xs"
          />
          <Select
            value={centerFilter}
            onChange={(e) => setCenterFilter(e.target.value)}
            className="w-auto py-1.5 text-xs"
          >
            <option value="">All centers</option>
            {centerOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="w-auto py-1.5 text-xs"
          >
            <option value="">All positions</option>
            {positionOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </TableToolbar>
      </Card>

      {groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          No records match the current filters.
        </Card>
      ) : (
        groups.map((list) => {
          const period = list[0].periodLabel;
          const total = list.reduce((s, r) => s + r.grandTotal, 0);
          return (
            <Card key={period} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
                <div>
                  <span className="font-semibold text-gray-900">{period}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {list.length} coach(es) · total {rm(total)}
                  </span>
                </div>
                <AllowanceExportButton period={period} rows={list} />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <SortTh label="Staff" sortKey="staff" sort={sort} onSort={toggleSort} />
                      <SortTh label="Position" sortKey="position" sort={sort} onSort={toggleSort} />
                      <SortTh label="Center 1" sortKey="center1" sort={sort} onSort={toggleSort} />
                      <SortTh label="Center 2" sortKey="center2" sort={sort} onSort={toggleSort} />
                      <SortTh label="Center 3" sortKey="center3" sort={sort} onSort={toggleSort} />
                      <SortTh
                        label="Attendance"
                        sortKey="attendance"
                        sort={sort}
                        onSort={toggleSort}
                        align="right"
                      />
                      <SortTh
                        label="Teaching"
                        sortKey="teaching"
                        sort={sort}
                        onSort={toggleSort}
                        align="right"
                      />
                      <SortTh
                        label="Other"
                        sortKey="other"
                        sort={sort}
                        onSort={toggleSort}
                        align="right"
                      />
                      <SortTh
                        label="Total"
                        sortKey="total"
                        sort={sort}
                        onSort={toggleSort}
                        align="right"
                      />
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {list.map((r) => (
                      <tr key={r.id} className="hover:bg-indigo-50/40">
                        <td className="px-4 py-2 font-medium text-gray-900">{r.canonicalName}</td>
                        <td className="px-4 py-2 text-gray-600">{r.tier}</td>
                        {[0, 1, 2].map((i) => (
                          <td key={i} className="px-4 py-2 text-gray-500">
                            {splitCenters(r.center)[i] || "—"}
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right text-gray-600">{rm(r.attendance)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{rm(r.teaching)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{rm(r.other)}</td>
                        <td className="px-4 py-2 text-right font-medium text-green-700">
                          {rm(r.grandTotal)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            href={`/allowance/history/${r.id}`}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
