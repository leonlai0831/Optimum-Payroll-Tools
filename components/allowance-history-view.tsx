"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ChevronDown, ChevronRight, History, Lock, LockOpen, Search } from "lucide-react";
import { Button, Card, Input, Select, Spinner } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast";
import { ConfirmModal, Modal } from "@/components/modal";
import { AllowanceExportButton } from "@/components/allowance-export-button";
import { previousPeriod } from "@/lib/allowance/period";
import {
  SortTh,
  TableToolbar,
  includesText,
  makeComparator,
  useSortState,
} from "@/components/table-controls";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import type { AllowanceRunSummary } from "@/lib/db/queries";
import { cn, rm, splitCenters } from "@/lib/utils";

function LockButton({ period, locked }: { period: string; locked: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function apply() {
    setConfirm(false);
    setBusy(true);
    try {
      const res = await fetch("/api/allowance/locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, locked: !locked }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed");
      }
      toast.success(locked ? `${period} unlocked.` : `${period} locked.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="px-2.5 py-1 text-xs"
        onClick={() => setConfirm(true)}
        disabled={busy}
        title={locked ? "Reopen this month for edits" : "Close this month (no more edits)"}
      >
        {busy ? <Spinner /> : locked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        {locked ? "Unlock" : "Lock"}
      </Button>
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={apply}
        title={locked ? `Unlock ${period}?` : `Lock ${period}?`}
        message={
          locked
            ? "Reopening lets managers add or edit this month's allowances again."
            : "Locking closes this month — allowances can't be added, edited, or deleted until it's unlocked."
        }
        confirmLabel={locked ? "Unlock" : "Lock month"}
        busy={busy}
      />
    </>
  );
}

/** Relabel a whole month — move every entry in `period` to another month. */
function ChangeMonthButton({ period }: { period: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(() => previousPeriod(period));
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!to || to === period) {
      toast.error("Pick a different target month.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/allowance/period/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: period, to }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; moved?: number };
      // A clash blocks the whole move; the server sends a 409 with the names.
      if (!res.ok) throw new Error(data.error || "Failed");
      const moved = data.moved ?? 0;
      toast.success(`Moved ${moved} ${moved === 1 ? "entry" : "entries"} from ${period} to ${to}.`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="px-2.5 py-1 text-xs"
        onClick={() => {
          setTo(previousPeriod(period));
          setOpen(true);
        }}
        title={`Move all of ${period} to another month`}
      >
        <ArrowLeftRight className="h-3.5 w-3.5" /> Change month
      </Button>
      <Modal
        open={open}
        onClose={busy ? () => {} : () => setOpen(false)}
        title={`Change month — ${period}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={busy || !to || to === period}>
              {busy && <Spinner />} Move to {to || "…"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Move every entry in <span className="font-semibold">{period}</span> to the month below.
            If anyone already has an entry in the target month, the move is blocked and they&rsquo;re
            listed — nothing is overwritten.
          </p>
          <label className="block text-sm font-medium text-gray-700">
            Move to month
            <Input
              type="month"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1"
            />
          </label>
        </div>
      </Modal>
    </>
  );
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

export function AllowanceHistoryView({
  rows,
  canEdit,
  savers,
  lockedPeriods = [],
  canLock = false,
}: {
  rows: AllowanceRunSummary[];
  canEdit: boolean;
  /** run id → last editor email, for admins/super admins; null hides attribution. */
  savers: Record<number, string> | null;
  /** Period labels that are locked (closed for edits). */
  lockedPeriods?: string[];
  /** Whether the current user may lock/unlock a month. */
  canLock?: boolean;
}) {
  const lockedSet = useMemo(() => new Set(lockedPeriods), [lockedPeriods]);
  const [q, setQ] = useState("");
  const [centerFilter, setCenterFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const { sort, toggleSort } = useSortState<keyof typeof ACCESSORS>();
  // Months are collapsed by default; click a header to expand. An active filter
  // expands every group so search results aren't hidden behind a collapsed month.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const filterActive = q.trim() !== "" || centerFilter !== "" || positionFilter !== "";
  function toggleExpand(period: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return next;
    });
  }

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
      <EmptyState
        icon={History}
        title="No allowances saved yet"
        body="Compute one on the Single entry tab and click “Save” to start the history."
      />
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
        <EmptyState
          icon={Search}
          title="No records match the current filters"
          body="Try clearing a filter or widening the search."
        />
      ) : (
        groups.map((list) => {
          const period = list[0].periodLabel;
          const total = list.reduce((s, r) => s + r.grandTotal, 0);
          const locked = lockedSet.has(period);
          const open = expanded.has(period) || filterActive;
          return (
            <Card key={period} className="overflow-hidden">
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 bg-gray-50 px-4 py-2",
                  open && "border-b border-gray-100",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(period)}
                  aria-expanded={open}
                  className="flex flex-1 flex-wrap items-center gap-2 text-left"
                  title={open ? "Collapse month" : "Expand month"}
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                  )}
                  <span className="font-semibold text-gray-900">{period}</span>
                  {locked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    {list.length} coach(es) · total {rm(total)}
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  {canLock && !locked && <ChangeMonthButton period={period} />}
                  {canLock && <LockButton period={period} locked={locked} />}
                  <AllowanceExportButton period={period} rows={list} />
                </div>
              </div>
              {open && (
                <>
                  <MobileCards>
                    {list.map((r) => {
                      const centers = splitCenters(r.center);
                      return (
                        <div key={r.id} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-gray-900">
                                {r.canonicalName}
                              </div>
                              <div className="mt-0.5 text-[11px] text-gray-400">
                                {r.tier || "—"}
                                {centers.length > 0 && <span> · {centers.join(", ")}</span>}
                              </div>
                              {savers?.[r.id] && (
                                <div className="text-[11px] text-gray-400">
                                  edited by {savers[r.id]}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-base font-bold tabular-nums text-green-700">
                                {rm(r.grandTotal)}
                              </div>
                              <div className="text-[11px] text-gray-400">total</div>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <div>
                              <div className="text-overline text-muted">Attendance</div>
                              <div className="mt-0.5 text-sm tabular-nums text-gray-700">
                                {rm(r.attendance)}
                              </div>
                            </div>
                            <div>
                              <div className="text-overline text-muted">Teaching</div>
                              <div className="mt-0.5 text-sm tabular-nums text-gray-700">
                                {rm(r.teaching)}
                              </div>
                            </div>
                            <div>
                              <div className="text-overline text-muted">Other</div>
                              <div className="mt-0.5 text-sm tabular-nums text-gray-700">
                                {rm(r.other)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            {canEdit && !locked && (
                              <Link
                                href={`/allowance?edit=${r.id}`}
                                className="flex-1 rounded-md border border-gray-200 py-2 text-center text-sm font-medium text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100"
                              >
                                Edit
                              </Link>
                            )}
                            <Link
                              href={`/allowance/history/${r.id}`}
                              className="flex-1 rounded-md border border-gray-200 py-2 text-center text-sm font-medium text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100"
                            >
                              View
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </MobileCards>
                  <DesktopTable>
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
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {r.canonicalName}
                          {savers?.[r.id] && (
                            <span className="block text-[11px] font-normal text-gray-400">
                              edited by {savers[r.id]}
                            </span>
                          )}
                        </td>
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
                          <div className="flex items-center justify-end gap-3">
                            {canEdit && !locked && (
                              <Link
                                href={`/allowance?edit=${r.id}`}
                                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                              >
                                Edit
                              </Link>
                            )}
                            <Link
                              href={`/allowance/history/${r.id}`}
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                            >
                              View
                            </Link>
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
        })
      )}
    </div>
  );
}
