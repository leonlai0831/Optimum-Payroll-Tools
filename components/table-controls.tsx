"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui";
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

// ----------------------------------------------------------------------------
// Search box
// ----------------------------------------------------------------------------

/**
 * Controlled search box with a leading icon and a clear (×) button when
 * non-empty. The parent owns the query string and filters its own rows
 * (typically with {@link includesText}). `text-base` at phone widths keeps iOS
 * from zooming the field on focus (see the design-language rule).
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="pl-8 pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Filters
// ----------------------------------------------------------------------------

export interface FilterOption<V extends string = string> {
  value: V;
  label: string;
}

/**
 * A labelled dropdown filter. The empty string is the "all" sentinel (its
 * option shows `allLabel`); a non-empty value highlights the control as active.
 */
export function FilterSelect<V extends string = string>({
  value,
  onChange,
  options,
  allLabel = "All",
  label,
  className,
}: {
  value: V | "";
  onChange: (value: V | "") => void;
  options: readonly FilterOption<V>[];
  allLabel?: string;
  label?: string;
  className?: string;
}) {
  const active = value !== "";
  return (
    <label className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      {label && <span className="shrink-0 text-gray-500">{label}</span>}
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value as V | "")}
        className={cn("w-auto", active && "border-indigo-400")}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

/**
 * Lays out a row of filter controls and shows a "Clear filters" button when
 * any filter is active (`active` is the parent's "something is set" flag).
 */
export function FilterBar({
  children,
  active,
  onClear,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {active && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition hover:text-gray-700"
        >
          <X className="h-3.5 w-3.5" /> Clear filters
        </button>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Row selection (select-all / clear)
// ----------------------------------------------------------------------------

export type TriState = "none" | "some" | "all";

/**
 * Tri-state for a "select all" control over a list of ids: "none" when nothing
 * (or an empty list) is selected, "all" when every id is, "some" otherwise.
 * Pure — unit-locked in `table-controls.test.ts`.
 */
export function triState(selectedCount: number, total: number): TriState {
  if (total <= 0 || selectedCount <= 0) return "none";
  return selectedCount >= total ? "all" : "some";
}

/**
 * Id-based multi-row selection: a `Set` of ids with single + bulk toggles that
 * survives re-renders. Pass the CURRENT visible ids to {@link stateOf} /
 * {@link allSelected} so a "select all" tracks the filtered list, not a stale
 * total. `toggleMany` selects/clears a group of ids together (e.g. every line
 * of one clocked window).
 */
export function useRowSelection<Id extends string | number = number>() {
  const [selected, setSelected] = React.useState<Set<Id>>(() => new Set());

  const has = React.useCallback((id: Id) => selected.has(id), [selected]);

  const toggle = React.useCallback((id: Id, on?: boolean) => {
    setSelected((s) => {
      const next = new Set(s);
      const want = on ?? !next.has(id);
      if (want) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleMany = React.useCallback((ids: Id[], on: boolean) => {
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  /** Replace the whole selection with exactly `ids`. */
  const selectOnly = React.useCallback((ids: Id[]) => setSelected(new Set(ids)), []);
  const clear = React.useCallback(() => setSelected(new Set()), []);

  /** Tri-state of a "select all" over exactly `ids` (internal accumulator
   *  shared by `allSelected`, so membership is counted once per call). */
  const stateOf = React.useCallback(
    (ids: Id[]): TriState => {
      const count = ids.reduce((n, id) => (selected.has(id) ? n + 1 : n), 0);
      return triState(count, ids.length);
    },
    [selected],
  );
  /** True when every id in a non-empty `ids` is selected. */
  const allSelected = React.useCallback((ids: Id[]) => stateOf(ids) === "all", [stateOf]);

  return {
    selected,
    size: selected.size,
    has,
    toggle,
    toggleMany,
    selectOnly,
    clear,
    stateOf,
    allSelected,
  };
}

/**
 * A tri-state "select all" checkbox: `state="all"` renders checked, `"some"`
 * indeterminate, `"none"` unchecked. A click always reports the browser's
 * desired state — clicking from "some" selects all (the box was unchecked), so
 * `onChange(true)` fires; consumers map `false` to clear.
 */
export function SelectAllCheckbox({
  state,
  onChange,
  className,
  "aria-label": ariaLabel = "Select all",
}: {
  state: TriState;
  onChange: (selectAll: boolean) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={ariaLabel}
      checked={state === "all"}
      onChange={(e) => onChange(e.target.checked)}
      className={cn("h-4 w-4 accent-indigo-600", className)}
    />
  );
}
