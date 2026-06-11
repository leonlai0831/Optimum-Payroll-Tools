"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calculator,
  Plus,
  Save,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button, Card, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { IngestSourceBadge, IngestStatusBadge } from "@/components/ingest-badges";
import type { InstructorRow } from "@/lib/kpi/types";
import {
  filterGridRows,
  parseNumericCell,
  sortGridRows,
  toGridRows,
  type IngestGridRow,
  type SortDir,
} from "@/lib/kpi/ingest-grid";
import { cn } from "@/lib/utils";

/** Serializable projection of a kpi_ingests row (dates as ISO strings for the client). */
export interface IngestDetail {
  id: number;
  periodLabel: string;
  label: string;
  status: "pending" | "imported" | "discarded" | "superseded";
  source: "api" | "manual";
  rows: InstructorRow[];
  importedRunId: number | null;
  importedAt: string | null;
  receivedAt: string;
}

/** Numeric InstructorRow fields, in display order, with compact column labels. */
const NUM_FIELDS: { key: keyof InstructorRow & string; label: string }[] = [
  { key: "TotalStudent", label: "Students" },
  { key: "TotalColor", label: "Total color" },
  { key: "Black", label: "Black" },
  { key: "LevelUp", label: "Level up" },
  { key: "Downgrade", label: "Downgrade" },
  { key: "Switch", label: "Switch" },
  { key: "Stop", label: "Stop" },
  { key: "Attended", label: "Attended" },
];

function emptyRow(): InstructorRow {
  return {
    Center: "",
    Instructor: "",
    TotalStudent: 0,
    TotalColor: 0,
    Black: 0,
    LevelUp: 0,
    Downgrade: 0,
    Switch: 0,
    Stop: 0,
    Attended: 0,
  };
}

/* Sticky-column geometry: the row-number column is 3rem wide and pinned at
   left-0; Instructor pins right after it at left-12. Keep widths and offsets
   in sync if you change either. */
const STICKY_NUM_COL = "sticky left-0 z-10 w-12 min-w-12";
const STICKY_NAME_COL = "sticky left-12 z-10 min-w-44 border-r border-gray-200";

/* Spreadsheet cell input: invisible until focused (borderless, transparent),
   then a ring + white fill. Deliberately text-sm even on phones — this dense
   power surface trades the iOS anti-zoom rule for Excel-like density. */
const CELL_INPUT =
  "w-full border-0 bg-transparent px-2 py-1 text-sm text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-indigo-500";

const TH =
  "border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500";
const TD = "border-b border-gray-100 p-0";

interface GridRowProps {
  row: IngestGridRow;
  /** 1-based position in the FULL row set (stable under filter/sort). */
  displayIndex: number;
  editable: boolean;
  dirty: boolean;
  onCommit: (id: number, key: keyof InstructorRow & string, value: string | number) => void;
  onDelete: (id: number) => void;
}

/**
 * One spreadsheet row. Memoized so a cell commit re-renders only the edited
 * row, not the whole grid — at 500+ rows that keeps blur/typing smooth. Inputs
 * are *uncontrolled* (committed onBlur), so keystrokes never touch React state.
 */
const GridRow = memo(function GridRow({
  row,
  displayIndex,
  editable,
  dirty,
  onCommit,
  onDelete,
}: GridRowProps) {
  const { data } = row;
  // Sticky cells scroll over the other columns, so they need an opaque bg that
  // matches the row tint (amber for dirty rows).
  const bg = dirty ? "bg-amber-50" : "bg-white";
  return (
    <tr className={bg}>
      <td className={cn(TD, STICKY_NUM_COL, bg, "nums px-2 py-1 text-right text-xs text-gray-400")}>
        {displayIndex}
      </td>
      <td className={cn(TD, STICKY_NAME_COL, bg)}>
        {editable ? (
          <input
            defaultValue={data.Instructor}
            data-col="Instructor"
            size={1} // collapse the intrinsic ~20ch width; the td min-w governs
            aria-label={`Instructor, row ${displayIndex}`}
            className={cn(CELL_INPUT, "font-medium")}
            onBlur={(e) => onCommit(row.id, "Instructor", e.target.value)}
          />
        ) : (
          <div className="px-2 py-1 text-sm font-medium text-gray-900">{data.Instructor || "—"}</div>
        )}
      </td>
      <td className={cn(TD, "min-w-32")}>
        {editable ? (
          <input
            defaultValue={data.Center}
            data-col="Center"
            size={1}
            aria-label={`Center, row ${displayIndex}`}
            className={CELL_INPUT}
            onBlur={(e) => onCommit(row.id, "Center", e.target.value)}
          />
        ) : (
          <div className="px-2 py-1 text-sm text-gray-500">{data.Center || "—"}</div>
        )}
      </td>
      {NUM_FIELDS.map(({ key }) => (
        <td key={key} className={cn(TD, "min-w-20")}>
          {editable ? (
            <input
              defaultValue={data[key] as number}
              data-col={key}
              size={1}
              inputMode="numeric"
              aria-label={`${key}, row ${displayIndex}`}
              className={cn(CELL_INPUT, "nums text-right")}
              onBlur={(e) => {
                const n = parseNumericCell(e.target.value);
                e.target.value = String(n); // normalize garbage so the DOM matches state
                onCommit(row.id, key, n);
              }}
            />
          ) : (
            <div className="nums px-2 py-1 text-right text-sm text-gray-600">
              {data[key] as number}
            </div>
          )}
        </td>
      ))}
      {editable && (
        <td className={cn(TD, "w-9 min-w-9 text-center")}>
          <button
            type="button"
            aria-label={`Delete row ${displayIndex}`}
            className="cursor-pointer rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
            onClick={() => onDelete(row.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
});

/**
 * Delivery review screen as an Excel-like spreadsheet grid: ONE delivery per
 * month carries hundreds of instructor rows, so density beats cards here. Edit
 * cells in place, delete/add rows, filter and sort the view — all local until
 * "Save changes" PATCHes the full row set back. Any NON-SUPERSEDED delivery is
 * editable — pending, imported and discarded records stay correctable as the
 * month's database (editing an imported one never changes the saved KPI run,
 * which snapshotted the rows at import time — a banner says so). Loading into
 * the calculator and discarding stay pending-only; "Load into calculator"
 * auto-saves any pending edits first, so what the calculator scores is always
 * exactly what this page shows. Superseded deliveries render read-only.
 *
 * EXCEPTION to the repo's cards-on-mobile rule: the owner explicitly accepts a
 * horizontally scrollable grid on phones for this power surface — hundreds of
 * rows are unreviewable as a card stack. Sticky header + sticky Instructor
 * column keep orientation while scrolling both axes.
 */
export function KpiIngestEditor({ ingest }: { ingest: IngestDetail }) {
  const router = useRouter();
  const toast = useToast();
  const editable = ingest.status !== "superseded";
  const pending = ingest.status === "pending";

  const [rows, setRows] = useState<IngestGridRow[]>(() => toGridRows(ingest.rows));
  // Mirror of `rows` for synchronous reads in event handlers (cell commits and
  // saves happen after the commit phase, so the effect-synced ref is current).
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const nextIdRef = useRef(ingest.rows.length);

  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<number>>(() => new Set());
  const [structureDirty, setStructureDirty] = useState(false); // rows added/removed
  const dirty = structureDirty || dirtyIds.size > 0;

  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [busy, setBusy] = useState<"save" | "load" | "discard" | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToEndRef = useRef(false);

  // Filter + sort are a VIEW over the full set; edits are keyed by stable row
  // id, and saves always send rowsRef.current (the full set, original order).
  const visible = useMemo(
    () => sortGridRows(filterGridRows(rows, query), sortDir),
    [rows, query, sortDir],
  );
  const indexById = useMemo(() => new Map(rows.map((r, i) => [r.id, i + 1])), [rows]);

  const commitCell = useCallback(
    (id: number, key: keyof InstructorRow & string, value: string | number) => {
      const current = rowsRef.current.find((r) => r.id === id);
      if (!current || current.data[key] === value) return; // blur without change: no re-render
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, data: { ...r.data, [key]: value } as InstructorRow } : r,
        ),
      );
      setDirtyIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    },
    [],
  );

  const deleteRow = useCallback((id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setDirtyIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setStructureDirty(true);
  }, []);

  function addRow() {
    const id = nextIdRef.current++;
    // Clear the view filters so the appended row is actually visible at the end.
    setQuery("");
    setSortDir(null);
    setRows((prev) => [...prev, { id, data: emptyRow() }]);
    setDirtyIds((prev) => new Set(prev).add(id));
    setStructureDirty(true);
    scrollToEndRef.current = true;
  }

  // After an add, scroll the new last row into view and focus its Instructor cell.
  useEffect(() => {
    if (!scrollToEndRef.current) return;
    scrollToEndRef.current = false;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    el.querySelector<HTMLInputElement>('tbody tr:last-child input[data-col="Instructor"]')?.focus();
  }, [rows]);

  function cycleSort() {
    setSortDir((d) => (d === null ? "asc" : d === "asc" ? "desc" : null));
  }

  // Enter behaves like a spreadsheet: jump to the same column one row down.
  function onGridKeyDown(e: React.KeyboardEvent<HTMLTableSectionElement>) {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLInputElement;
    if (target.tagName !== "INPUT" || !target.dataset.col) return;
    e.preventDefault();
    const next = target
      .closest("tr")
      ?.nextElementSibling?.querySelector<HTMLInputElement>(
        `input[data-col="${target.dataset.col}"]`,
      );
    if (next) {
      next.focus();
      next.select();
    } else {
      target.blur(); // last row: just commit
    }
  }

  async function saveRows(): Promise<boolean> {
    const res = await fetch(`/api/kpi/ingests/${ingest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rowsRef.current.map((r) => r.data) }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error || "Failed to save rows");
      return false;
    }
    setDirtyIds(new Set());
    setStructureDirty(false);
    return true;
  }

  async function onSave() {
    setBusy("save");
    try {
      if (await saveRows()) toast.success("Rows saved.");
    } finally {
      setBusy(null);
    }
  }

  async function onLoad() {
    setBusy("load");
    try {
      // Persist pending edits first so the calculator scores exactly these rows.
      if (dirty && !(await saveRows())) return;
      router.push(`/kpi?ingest=${ingest.id}`);
    } finally {
      setBusy(null);
    }
  }

  async function onDiscard() {
    if (!window.confirm("Discard this delivery? It stays viewable here but can no longer be loaded.")) {
      return;
    }
    setBusy("discard");
    try {
      const res = await fetch(`/api/kpi/ingests/${ingest.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error || "Failed to discard");
        return;
      }
      toast.success("Delivery discarded.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header: meta + status. Actions live in the sticky bar below the grid. */}
      <Card className="p-4">
        <h1 className="flex flex-wrap items-center gap-2 text-lg font-bold text-gray-900">
          {ingest.periodLabel}
          <IngestStatusBadge status={ingest.status} />
          <IngestSourceBadge source={ingest.source} />
        </h1>
        <p className="mt-0.5 text-xs text-gray-500">
          {ingest.label || (ingest.source === "manual" ? "Manual upload" : "API upload")} ·{" "}
          {rows.length} rows · received {new Date(ingest.receivedAt).toLocaleString()}
        </p>
        {ingest.status === "imported" && (
          <p className="mt-1 text-sm text-green-700">
            Imported{ingest.importedAt ? ` on ${new Date(ingest.importedAt).toLocaleDateString()}` : ""}
            {ingest.importedRunId != null && (
              <>
                {" — "}
                <Link className="font-medium underline" href={`/kpi/history/${ingest.importedRunId}`}>
                  view the saved run →
                </Link>
              </>
            )}
          </p>
        )}
        {ingest.status === "discarded" && (
          <p className="mt-1 text-sm text-gray-500">
            This delivery was discarded — kept (and still correctable) for the record, it can no
            longer be loaded into the calculator.
          </p>
        )}
        {ingest.status === "superseded" && (
          <p className="mt-1 text-sm text-gray-500">
            This delivery was superseded by a newer push for the same month — kept read-only for
            the record, it can no longer be edited or loaded.
          </p>
        )}
      </Card>

      {/* Editing an imported month corrects the database record ONLY — the saved
          KPI run was computed from a snapshot of these rows at import time. */}
      {ingest.status === "imported" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">
              Edits here do not change the saved KPI run for {ingest.periodLabel}.
            </span>{" "}
            The run was computed from a snapshot taken when this delivery was imported — saving
            changes only corrects this stored month&apos;s student data. To recompute the bonus,
            reopen the run in KPI History.
          </p>
        </div>
      )}

      {/* The spreadsheet grid. */}
      <Card className="overflow-hidden">
        {/* Toolbar: counts, view filter, add row. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
          <span className="nums text-xs font-medium text-gray-500">
            {rows.length} rows
            {visible.length !== rows.length && ` · ${visible.length} shown`}
          </span>
          <div className="relative ml-auto min-w-0 flex-1 sm:max-w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter instructor / center"
              aria-label="Filter rows by instructor or center"
              className="w-full rounded-md border border-gray-300 py-1 pl-7 pr-2 text-sm outline-none transition-colors hover:border-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          {editable && (
            <Button variant="outline" size="sm" onClick={addRow} disabled={busy !== null}>
              <Plus className="h-3.5 w-3.5" /> Add row
            </Button>
          )}
        </div>

        {/* Bounded-height, both-axis scroll. Horizontal scroll is INTENTIONAL on
            phones here (owner-approved exception to the cards-on-mobile rule —
            see the component doc comment). border-separate keeps cell borders
            attached to the sticky cells while scrolling. */}
        <div ref={scrollRef} className="max-h-[70vh] overflow-auto overscroll-contain">
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={cn(TH, STICKY_NUM_COL, "top-0 z-30 text-right")}>#</th>
                <th className={cn(TH, STICKY_NAME_COL, "top-0 z-30 p-0 text-left")}>
                  <button
                    type="button"
                    onClick={cycleSort}
                    className="flex w-full cursor-pointer items-center gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide hover:text-gray-800"
                    aria-label={`Sort by instructor (${sortDir ?? "original order"})`}
                  >
                    Instructor
                    {sortDir === "asc" ? (
                      <ArrowUp className="h-3 w-3 text-indigo-600" />
                    ) : sortDir === "desc" ? (
                      <ArrowDown className="h-3 w-3 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-gray-300" />
                    )}
                  </button>
                </th>
                <th className={cn(TH, "sticky top-0 z-20 text-left")}>Center</th>
                {NUM_FIELDS.map(({ key, label }) => (
                  <th key={key} className={cn(TH, "sticky top-0 z-20 text-right")}>
                    {label}
                  </th>
                ))}
                {editable && <th className={cn(TH, "sticky top-0 z-20")}></th>}
              </tr>
            </thead>
            <tbody onKeyDown={editable ? onGridKeyDown : undefined}>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={editable ? 12 : 11}
                    className="px-3 py-8 text-center text-sm text-gray-500"
                  >
                    {rows.length === 0 ? "No rows." : "No rows match the filter."}
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <GridRow
                    key={r.id}
                    row={r}
                    displayIndex={indexById.get(r.id) ?? 0}
                    editable={editable}
                    dirty={dirtyIds.has(r.id)}
                    onCommit={commitCell}
                    onDelete={deleteRow}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Sticky save bar (any editable status): counts + the actions. Load +
          Discard stay pending-only — an imported month already became a run and
          a discarded one was deliberately dropped. */}
      {editable && (
        <div className="sticky bottom-2 z-30">
          <Card className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 shadow-lg">
            <span className="nums text-xs text-gray-500">
              {rows.length} rows · {dirtyIds.size} edited
              {structureDirty && " · rows added/removed"}
              {dirty && <span className="ml-1 font-medium text-amber-700">— unsaved</span>}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={onSave} disabled={busy !== null || !dirty}>
                {busy === "save" ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
              </Button>
              {pending && (
                <>
                  <Button onClick={onLoad} disabled={busy !== null}>
                    {busy === "load" ? <Spinner /> : <Calculator className="h-4 w-4" />} Load into calculator
                  </Button>
                  <Button variant="danger" onClick={onDiscard} disabled={busy !== null}>
                    {busy === "discard" ? <Spinner /> : <Trash2 className="h-4 w-4" />} Discard
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
