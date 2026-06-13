"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmployeeOption {
  id: number;
  name: string;
  /** Secondary distinguisher shown under the name (e.g. the coach's center). */
  subtitle?: string;
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
  takenBy,
}: {
  coaches: EmployeeOption[];
  gymStaff: EmployeeOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /**
   * token ("coach:ID" / "gym:ID") → email of the account it's ALREADY linked to.
   * One workforce profile ↔ one login: such a profile is shown greyed + locked
   * here (the account's own current `value` is never locked). The server still
   * enforces this with a 409; this is the up-front guide.
   */
  takenBy?: ReadonlyMap<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Flatten to {token, name, subtitle, group} so search spans both brands.
  const items = useMemo(
    () => [
      ...coaches.map((c) => ({
        token: `coach:${c.id}`,
        name: c.name,
        subtitle: c.subtitle,
        group: "Swim School" as const,
      })),
      ...gymStaff.map((g) => ({
        token: `gym:${g.id}`,
        name: g.name,
        subtitle: g.subtitle,
        group: "Optimum Fit" as const,
      })),
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
  const filtered = q
    ? items.filter((i) => `${i.name} ${i.subtitle ?? ""}`.toLowerCase().includes(q))
    : items;

  // Email of the account this token is already linked to, EXCEPT this row's own
  // current selection (which must stay shown + selectable). undefined = free.
  const takenEmailOf = (token: string): string | undefined =>
    token !== value ? takenBy?.get(token) : undefined;

  function pick(token: string) {
    if (takenEmailOf(token)) return; // locked — already linked elsewhere
    onChange(token);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        title={selected ? `${selected.name}${selected.subtitle ? ` · ${selected.subtitle}` : ""}` : undefined}
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
        // Panel is wider than the (often narrow) trigger so long, similar names
        // ("MUHAMMAD …") are readable in full instead of truncating.
        <div className="absolute left-0 z-50 mt-1 w-[min(22rem,90vw)] min-w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-2.5 py-2">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter") {
                  // Pick the first SELECTABLE match (skip ones linked elsewhere).
                  const first = filtered.find((i) => !takenEmailOf(i.token));
                  if (first) {
                    e.preventDefault();
                    pick(first.token);
                  }
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
            {filtered.map((i) => {
              const takenEmail = takenEmailOf(i.token);
              if (takenEmail) {
                // Locked: linked to another account. Greyed, not clickable, with
                // the linking account shown (and a hover tooltip — phones, which
                // have no hover, still see the inline sub-label).
                return (
                  <li key={i.token}>
                    <div
                      aria-disabled
                      title={`Linked to ${takenEmail}`}
                      className="flex w-full cursor-not-allowed items-start justify-between gap-2 px-3 py-1.5 text-left opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block break-words font-medium text-gray-400">{i.name}</span>
                        <span className="block text-[11px] text-gray-400">
                          Linked to {takenEmail}
                        </span>
                      </span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={i.token}>
                  <button
                    type="button"
                    onClick={() => pick(i.token)}
                    className={cn(
                      "flex w-full items-start justify-between gap-2 px-3 py-1.5 text-left hover:bg-gray-100",
                      i.token === value && "bg-indigo-50",
                    )}
                  >
                    <span className="min-w-0">
                      {/* Full name, wrapping if long — never truncated, so similar
                          names stay distinguishable. */}
                      <span className="block break-words font-medium text-gray-800">{i.name}</span>
                      <span className="block text-[11px] text-gray-400">
                        {i.subtitle ? `${i.subtitle} · ${i.group}` : i.group}
                      </span>
                    </span>
                    {i.token === value && (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                    )}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-center text-gray-400">No match for “{query}”.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
