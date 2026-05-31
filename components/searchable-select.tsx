"use client";

import * as React from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboOption {
  value: string;
  label: string;
}

/**
 * A compact searchable picker: a button that opens a popover with a search box
 * and a scrollable, **A–Z sorted** option list. Built for long lists (e.g. the
 * coach link dropdown) where a native <select> is unwieldy.
 *
 * `pinned` options always render above the list and are never filtered by the
 * query (used for the "Not applicable" action). The component is action-style:
 * it shows `placeholder` rather than a selected value and fires `onSelect`.
 */
export function SearchableSelect({
  options,
  onSelect,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  pinned = [],
  emptyText = "No matches",
  className,
}: {
  options: ComboOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  pinned?: ComboOption[];
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sort A–Z by label (labels begin with the coach name, so this orders by name).
  const sorted = React.useMemo(
    () => [...options].sort((a, b) => a.label.localeCompare(b.label)),
    [options],
  );
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((o) => o.label.toLowerCase().includes(q));
  }, [sorted, query]);
  // Pinned options stay visible regardless of the query.
  const visible = React.useMemo(() => [...pinned, ...filtered], [pinned, filtered]);

  // Open with a fresh query/highlight (state resets live here, not in an effect).
  function openMenu() {
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  // While open: focus the search box and close on an outside click.
  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open]);

  function choose(value: string) {
    onSelect(value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = visible[active];
      if (opt) choose(opt.value);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex w-full items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-left text-[11px] text-gray-500 shadow-sm outline-none hover:border-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
      >
        <span className="truncate">{placeholder}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-1 border-b border-gray-100 px-2 py-1.5">
            <Search className="h-3 w-3 shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Highlight the first real match while searching, else the first pinned row.
                setActive(e.target.value.trim() ? pinned.length : 0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-[11px] outline-none placeholder:text-gray-400"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <p className="px-2 py-2 text-center text-[11px] text-gray-400">{emptyText}</p>
            ) : (
              visible.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={cn(
                    "block w-full truncate px-2 py-1 text-left text-[11px]",
                    i === active ? "bg-indigo-50 text-indigo-900" : "text-gray-700 hover:bg-gray-50",
                  )}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
