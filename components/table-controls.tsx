"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export type SortState<K extends string = string> = { key: K; dir: SortDir } | null;
type SortValue = string | number | null | undefined;

function isEmpty(v: SortValue): boolean {
  return v === null || v === undefined || v === "";
}

/** Build a comparator from a per-key accessor map. Empty values always sort last. */
export function makeComparator<T, K extends string>(
  accessors: Record<K, (row: T) => SortValue>,
  sort: SortState<K>,
): (a: T, b: T) => number {
  if (!sort) return () => 0;
  const get = accessors[sort.key];
  if (!get) return () => 0;
  const factor = sort.dir === "asc" ? 1 : -1;
  return (a, b) => {
    const av = get(a);
    const bv = get(b);
    if (isEmpty(av) && isEmpty(bv)) return 0;
    if (isEmpty(av)) return 1;
    if (isEmpty(bv)) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor;
  };
}

/** Sort-state machine: click a key to cycle asc -> desc -> off. */
export function useSortState<K extends string>(initial: SortState<K> = null) {
  const [sort, setSort] = React.useState<SortState<K>>(initial);
  const toggleSort = React.useCallback((key: K) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }, []);
  return { sort, toggleSort, setSort };
}

/** Sort a flat row list with click-to-sort header state. */
export function useTableSort<T, K extends string>(
  rows: T[],
  accessors: Record<K, (row: T) => SortValue>,
  initial: SortState<NoInfer<K>> = null,
) {
  const { sort, toggleSort, setSort } = useSortState<K>(initial);
  const sorted = React.useMemo(
    () => (sort ? [...rows].sort(makeComparator(accessors, sort)) : rows),
    [rows, sort, accessors],
  );
  return { sorted, sort, toggleSort, setSort };
}

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

/** A clickable column header that drives a `useSortState`/`useTableSort` sort. */
export function SortTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: React.ReactNode;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  align?: keyof typeof alignClass;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th className={cn("px-4 py-2", alignClass[align], className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "group inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-gray-700",
          align === "right" && "flex-row-reverse",
          active && "text-gray-900",
        )}
      >
        <span>{label}</span>
        <Icon
          className={cn(
            "h-3 w-3 shrink-0",
            active ? "opacity-100" : "opacity-30 group-hover:opacity-60",
          )}
        />
      </button>
    </th>
  );
}

/** Consistent filter/toolbar strip above a table. */
export function TableToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function includesText(haystack: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  return n === "" || haystack.toLowerCase().includes(n);
}
