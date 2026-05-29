"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AllowanceTier } from "@/lib/allowance/types";

export interface StaffOption {
  id: number;
  canonicalName: string;
  allowanceTier: AllowanceTier | null;
}

/** Searchable staff picker. `value` is "" (none), "__new__", or String(id) —
 * matching the original native select so the calculator's handler is unchanged. */
export function StaffCombobox({
  options,
  value,
  onChange,
  className,
}: {
  options: StaffOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = value && value !== "__new__" ? options.find((o) => String(o.id) === value) : null;
  const label =
    value === "__new__"
      ? "+ new staff…"
      : selected
        ? `${selected.canonicalName}${selected.allowanceTier ? ` (${selected.allowanceTier})` : ""}`
        : "— select —";

  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.canonicalName.toLowerCase().includes(q)) : options;

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setOpen((o) => !o);
        }}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500",
          !selected && value !== "__new__" && "text-gray-500",
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-2.5 py-2">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && filtered.length > 0) {
                  e.preventDefault();
                  pick(String(filtered[0].id));
                }
              }}
              placeholder="Search name…"
              className="w-full text-sm outline-none placeholder:text-gray-400"
            />
          </div>
          <ul className="max-h-60 overflow-auto py-1 text-sm">
            <li>
              <button
                type="button"
                onClick={() => pick("__new__")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium text-indigo-600 hover:bg-indigo-50"
              >
                <Plus className="h-3.5 w-3.5" /> new staff…
              </button>
            </li>
            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => pick(String(o.id))}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-gray-100",
                    String(o.id) === value && "bg-indigo-50",
                  )}
                >
                  <span className="truncate">
                    {o.canonicalName}
                    {o.allowanceTier ? <span className="text-gray-400"> ({o.allowanceTier})</span> : null}
                  </span>
                  {String(o.id) === value && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                  )}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-center text-gray-400">No staff match “{query}”.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
