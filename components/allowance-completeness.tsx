"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, ClipboardList } from "lucide-react";
import { Card, Select } from "@/components/ui";
import { cn, splitCenters } from "@/lib/utils";

export interface RosterEntry {
  id: number;
  name: string;
  center: string;
}

/**
 * "Who still needs allowance entered this month" panel. Compares the active
 * roster against the set of staff names already saved for the selected period,
 * so managers can see at a glance who's outstanding (optionally filtered to one
 * center, for the multi-center / multi-manager workflow).
 */
export function AllowanceCompleteness({
  period,
  roster,
  savedNames,
}: {
  period: string;
  roster: RosterEntry[];
  /** Canonical names that already have a saved allowance for `period`. */
  savedNames: string[];
}) {
  const [center, setCenter] = useState("");
  // Names collapse by default — on a phone the full outstanding list is a wall;
  // the count above is the at-a-glance signal, the list is tap-to-expand.
  const [showNames, setShowNames] = useState(false);

  const centerOptions = useMemo(
    () => [...new Set(roster.flatMap((r) => splitCenters(r.center)))].sort(),
    [roster],
  );

  const { recorded, missing, scoped } = useMemo(() => {
    const saved = new Set(savedNames);
    const scoped = center
      ? roster.filter((r) => splitCenters(r.center).includes(center))
      : roster;
    const missing = scoped.filter((r) => !saved.has(r.name));
    const recorded = scoped.length - missing.length;
    return { recorded, missing, scoped };
  }, [roster, savedNames, center]);

  const allDone = scoped.length > 0 && missing.length === 0;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h3 text-gray-900">
          {allDone ? (
            <ClipboardCheck className="h-4 w-4 text-green-600" />
          ) : (
            <ClipboardList className="h-4 w-4 text-indigo-500" />
          )}
          This month · {period}
        </h3>
        {centerOptions.length > 0 && (
          <Select
            value={center}
            onChange={(e) => setCenter(e.target.value)}
            className="w-auto py-1.5 text-xs"
          >
            <option value="">All centers</option>
            {centerOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
      </div>

      <p className="mt-2 text-sm text-gray-600">
        <span className="font-semibold text-gray-900">{recorded}</span> of{" "}
        <span className="font-semibold text-gray-900">{scoped.length}</span> active staff recorded
        {center ? ` in ${center}` : ""}.
      </p>

      {missing.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowNames((s) => !s)}
            aria-expanded={showNames}
            className="flex min-h-9 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-700 hover:text-amber-800"
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 transition-transform", showNames && "rotate-90")}
              aria-hidden
            />
            Not yet recorded ({missing.length})
            <span className="font-medium normal-case text-amber-600">
              · {showNames ? "hide" : "show"}
            </span>
          </button>
          {showNames && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {missing.map((m) => (
                <Link
                  key={m.id}
                  href="/allowance"
                  className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  title="Enter allowance"
                >
                  {m.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        scoped.length > 0 && (
          <p className="mt-1 text-xs font-medium text-green-700">
            All active staff recorded for {period}
            {center ? ` in ${center}` : ""}. ✓
          </p>
        )
      )}
    </Card>
  );
}
