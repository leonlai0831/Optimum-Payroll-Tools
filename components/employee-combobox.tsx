"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmployeeOption {
  id: number;
  name: string;
}

/**
 * Searchable picker for the "linked employee" field — a Swim coach OR an
 * Optimum Fit gym-staff member. `value` is the same token the old native select
 * used ("" = none, "coach:ID", "gym:ID"), so callers (`parseLinkToken`) are
 * unchanged. Built for ~180-long coach lists where a plain dropdown is unusable.
 */
export function EmployeeCombobox({
  coaches,
  gymStaff,
  value,
  onChange,
  disabled,
  className,
}: {
  coaches: EmployeeOption[];
  gymStaff: EmployeeOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Flatten to {token, name, group} so search spans both brands.
  const items = useMemo(
    () => [
      ...coaches.map((c) => ({ token: `coach:${c.id}`, name: c.name, group: "Swim School" as const })),
      ...gymStaff.map((g) => ({ token: `gym:${g.id}`, name: g.name, group: "Optimum Fit" as const })),
    ],
    [coaches, gymStaff],
  );

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = value ? items.find((i) => i.token === value) : null;
  const label = selected ? selected.name : "— none —";

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;

  function pick(token: string) {
    onChange(token);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setQuery("");
          setOpen((o) => !o);
        }}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60",
          !selected && "text-gray-500",
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
                  pick(filtered[0].token);
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
                onClick={() => pick("")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-gray-500 hover:bg-gray-100"
              >
                <X className="h-3.5 w-3.5" /> none
              </button>
            </li>
            {filtered.map((i) => (
              <li key={i.token}>
                <button
                  type="button"
                  onClick={() => pick(i.token)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-gray-100",
                    i.token === value && "bg-indigo-50",
                  )}
                >
                  <span className="truncate">
                    {i.name}
                    <span className="ml-1 text-[11px] text-gray-400">{i.group}</span>
                  </span>
                  {i.token === value && <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-center text-gray-400">No match for “{query}”.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
