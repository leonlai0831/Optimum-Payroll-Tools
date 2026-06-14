"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, Search, Trash2 } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import {
  FilterBar,
  FilterSelect,
  SearchInput,
  SortTh,
  TableToolbar,
  includesText,
  makeComparator,
  useSortState,
} from "@/components/table-controls";
import { formatDate, rm } from "@/lib/utils";

/** Sort keys: the fixed columns plus one per dynamic stat column (`stat:<i>`). */
type ShellSortKey = "period" | "saved" | "total" | `stat:${number}`;

/** One saved month, pre-mapped by the caller into the shared shape. */
export type RunHistoryRow = {
  id: number;
  periodLabel: string;
  createdAt: Date;
  /** Detail page for the run. */
  href: string;
  /** Excel download endpoint. */
  exportHref: string;
  /** Middle numeric columns (labels must match across rows). */
  stats: { label: string; value: string }[];
  /** Money total for the run (rendered with rm()). */
  total: number;
};

/**
 * Shared saved-months list for the Fit calculators (commission + coaching):
 * cards on phones, the classic table at `lg`+. The caller supplies rows plus
 * the strings/endpoints that differ between the two histories.
 */
export function RunHistoryShell({
  rows,
  totalLabel,
  emptyText,
  deleteUrlBase,
  deletePrompt,
  deletedToast,
}: {
  rows: RunHistoryRow[];
  /** Header for the money column, e.g. "Total commission". */
  totalLabel: string;
  emptyText: string;
  /** DELETE endpoint prefix; the run id is appended. */
  deleteUrlBase: string;
  deletePrompt: (periodLabel: string) => string;
  deletedToast: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [deleting, setDeleting] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const { sort, toggleSort } = useSortState<ShellSortKey>();
  const filterActive = q.trim() !== "" || yearFilter !== "";
  function resetFilters() {
    setQ("");
    setYearFilter("");
  }

  const yearOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.periodLabel.slice(0, 4)))]
        .sort()
        .reverse()
        .map((y) => ({ value: y, label: y })),
    [rows],
  );

  // Build sort accessors: the period/saved/total columns plus one per stat,
  // keyed by the stat's index so a stat header drives its own column.
  const accessors = useMemo(() => {
    const map: Record<string, (r: RunHistoryRow) => string | number> = {
      period: (r) => r.periodLabel,
      saved: (r) => r.createdAt.getTime(),
      total: (r) => r.total,
    };
    (rows[0]?.stats ?? []).forEach((_, i) => {
      map[`stat:${i}`] = (r) => r.stats[i]?.value ?? "";
    });
    return map as Record<ShellSortKey, (r: RunHistoryRow) => string | number>;
  }, [rows]);

  const visible = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (!includesText(r.periodLabel, q)) return false;
      if (yearFilter && r.periodLabel.slice(0, 4) !== yearFilter) return false;
      return true;
    });
    return sort ? [...filtered].sort(makeComparator(accessors, sort)) : filtered;
  }, [rows, q, yearFilter, sort, accessors]);

  async function remove(id: number, label: string) {
    if (!confirm(deletePrompt(label))) return;
    setDeleting(id);
    try {
      const res = await fetch(`${deleteUrlBase}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success(deletedToast);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  if (rows.length === 0) {
    return <Card className="p-8 text-center text-sm text-gray-500">{emptyText}</Card>;
  }

  const statLabels = rows[0].stats.map((s) => s.label);

  return (
    <Card className="overflow-hidden">
      <TableToolbar className="flex-col items-stretch lg:flex-row lg:items-center">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search month…"
          className="lg:max-w-xs"
        />
        {yearOptions.length > 1 && (
          <FilterBar active={filterActive} onClear={resetFilters}>
            <FilterSelect
              label="Year"
              value={yearFilter}
              onChange={setYearFilter}
              options={yearOptions}
              allLabel="All years"
            />
          </FilterBar>
        )}
      </TableToolbar>

      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No months match the current filters"
          body="Try clearing a filter or widening the search."
        />
      ) : (
        <>
      <MobileCards>
        {visible.map((r) => (
          <div key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={r.href} className="font-semibold text-gray-900 hover:text-brand">
                  {r.periodLabel}
                </Link>
                <div className="mt-0.5 text-[11px] text-gray-400">
                  saved {formatDate(r.createdAt)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="nums text-base font-bold text-green-700">{rm(r.total)}</div>
                <div className="text-[11px] text-gray-400">{totalLabel.toLowerCase()}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {r.stats.map((s) => (
                <div key={s.label}>
                  <div className="text-overline text-muted">{s.label}</div>
                  <div className="nums mt-0.5 text-sm text-gray-700">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Link
                href={r.href}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 text-sm font-medium text-brand hover:bg-brand/5 active:bg-brand/10"
              >
                <Eye className="h-4 w-4" /> View
              </Link>
              <a
                href={r.exportHref}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 text-sm font-medium text-green-700 hover:bg-green-50 active:bg-green-100"
              >
                <Download className="h-4 w-4" /> Excel
              </a>
              <button
                onClick={() => remove(r.id, r.periodLabel)}
                disabled={deleting === r.id}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-50"
              >
                {deleting === r.id ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete
              </button>
            </div>
          </div>
        ))}
      </MobileCards>

      <DesktopTable>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-overline text-muted">
              <SortTh label="Period" sortKey="period" sort={sort} onSort={toggleSort} className="px-3" />
              <SortTh label="Saved" sortKey="saved" sort={sort} onSort={toggleSort} className="px-3" />
              {statLabels.map((label, i) => (
                <SortTh
                  key={label}
                  label={label}
                  sortKey={`stat:${i}` as ShellSortKey}
                  sort={sort}
                  onSort={toggleSort}
                  align="right"
                  className="px-3"
                />
              ))}
              <SortTh
                label={totalLabel}
                sortKey="total"
                sort={sort}
                onSort={toggleSort}
                align="right"
                className="px-3"
              />
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((r) => (
              <tr key={r.id} className="tabular-nums">
                <td className="px-3 py-2 font-medium text-gray-900">
                  <Link href={r.href} className="hover:text-brand hover:underline">
                    {r.periodLabel}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-500">{formatDate(r.createdAt)}</td>
                {r.stats.map((s) => (
                  <td key={s.label} className="px-3 py-2 text-right text-gray-600">
                    {s.value}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-bold text-green-700">{rm(r.total)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={r.href} title="View" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand">
                      <Eye className="h-4 w-4" />
                    </Link>
                    <a href={r.exportHref} title="Download Excel" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-green-700">
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => remove(r.id, r.periodLabel)}
                      disabled={deleting === r.id}
                      title="Delete"
                      className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                    >
                      {deleting === r.id ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DesktopTable>
        </>
      )}
    </Card>
  );
}
