"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import {
  FilterBar,
  FilterSelect,
  SearchInput,
  SelectAllCheckbox,
  SortTh,
  includesText,
  useRowSelection,
  useTableSort,
} from "@/components/table-controls";
import { ROLE_LABELS, type Role } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

export interface CenterScopeUser {
  id: number;
  email: string;
  displayName: string;
  fullName: string;
  role: Role;
  /** Stored per-user override; null/empty = manages ALL centers. */
  managedCenters: string[] | null;
  /** Effective launcher access to the swim brand. The centers are all swim
   *  centers, so center scope is a no-op for an account without it. */
  hasSwimAccess: boolean;
  active: boolean;
}

type ScopeFilter = "" | "all" | "restricted";
type ActiveFilter = "" | "active" | "inactive";
type SortKey = "account" | "role" | "scope";

/** Re-cast a stored override to the configured centers' canonical casing + order,
 *  dropping any center no longer configured (null stays null = all). */
function normalizeOverride(
  stored: string[] | null | undefined,
  allCenters: string[],
): string[] | null {
  if (stored == null) return null;
  const upper = new Set(stored.map((c) => c.trim().toUpperCase()));
  return allCenters.filter((c) => upper.has(c.toUpperCase()));
}

/**
 * System Setting → Permissions → "Per-account access": per-account CENTER scope
 * for approvals (timesheet + lesson-plan review, KPI finalize). By default an
 * account "Manages all centers"; "Restrict" reveals the center chips so it can
 * be pinned to a subset (Reset returns it to all). super_admin rows are locked —
 * they always manage every center. Only accounts whose role can review/finalize
 * are passed in.
 *
 * The list ships the standard Search + Sort + Filter controls plus a select-all
 * and a bulk action bar (restrict to / reset across the selected rows) — built
 * on the shared `table-controls` kit (see the list-control standard in CLAUDE.md
 * Conventions).
 *
 * All mutation state lives HERE (each user renders twice — mobile card + desktop
 * row — so row-local state would fork between mounts). Updates are optimistic —
 * the override flips immediately and reverts on failure — and a row is disabled
 * while its PATCH is in flight. "Restrict" only reveals the chips locally (no
 * write); the account isn't actually narrowed until a center is selected, so
 * leaving with nothing chosen is a no-op (it stays "all").
 */
export function CenterOverrides({
  users,
  allCenters,
}: {
  users: CenterScopeUser[];
  allCenters: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  // null = manages all (inheriting); an array = the chosen subset (may be []
  // while the chips are open but nothing is selected yet → still "all").
  const [overrideById, setOverrideById] = useState<Record<number, string[] | null>>(() =>
    Object.fromEntries(users.map((u) => [u.id, normalizeOverride(u.managedCenters, allCenters)])),
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const sel = useRowSelection<number>();

  // ── List controls ────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("");

  const roleOptions = useMemo(() => {
    const present = Array.from(new Set(users.map((u) => u.role)));
    return present.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  }, [users]);

  // managesAll: no restriction (null) or an empty subset (still all).
  const managesAllFor = (u: CenterScopeUser) => {
    const o = overrideById[u.id] ?? null;
    return o === null || o.length === 0;
  };

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const hay = `${u.displayName} ${u.fullName} ${u.email}`;
      if (!includesText(hay, query)) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (activeFilter && (activeFilter === "active") !== u.active) return false;
      if (scopeFilter) {
        // Locked (super_admin) and no-swim accounts have no meaningful scope.
        if (u.role === "super_admin" || !u.hasSwimAccess) return false;
        const all = managesAllFor(u);
        if (scopeFilter === "all" && !all) return false;
        if (scopeFilter === "restricted" && all) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, query, roleFilter, scopeFilter, activeFilter, overrideById]);

  const { sorted, sort, toggleSort } = useTableSort<CenterScopeUser, SortKey>(filtered, {
    account: (u) => u.displayName || u.fullName || u.email,
    role: (u) => ROLE_LABELS[u.role],
    scope: (u) => (u.role === "super_admin" ? -1 : managesAllFor(u) ? 0 : (overrideById[u.id] ?? []).length),
  });

  const selectableIds = useMemo(
    () => sorted.filter((u) => u.role !== "super_admin" && u.hasSwimAccess).map((u) => u.id),
    [sorted],
  );
  // Selection persists across filtering, but the bulk bar + actions only apply
  // to rows visible under the current filter — count/operate on the visible
  // subset so "N selected" can't disagree with what a bulk action touches.
  const selectedVisibleIds = useMemo(
    () => selectableIds.filter((id) => sel.selected.has(id)),
    [selectableIds, sel.selected],
  );
  const selectedCount = selectedVisibleIds.length;
  const filtersActive =
    query !== "" || roleFilter !== "" || scopeFilter !== "" || activeFilter !== "";

  async function patchOverride(user: CenterScopeUser, next: string[] | null) {
    const previous = overrideById[user.id] ?? null;
    setOverrideById((m) => ({ ...m, [user.id]: next }));
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managedCenters: next }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Update failed");
      }
      router.refresh();
    } catch (e) {
      setOverrideById((m) => ({ ...m, [user.id]: previous }));
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  function toggle(user: CenterScopeUser, center: string) {
    const current = overrideById[user.id] ?? [];
    const next = current.includes(center)
      ? current.filter((c) => c !== center)
      : // Keep canonical center order so saved lists stay comparable.
        allCenters.filter((c) => c === center || current.includes(c));
    void patchOverride(user, next);
  }

  // ── Bulk actions over the current selection ────────────────────────────────
  async function bulkApply(label: string, compute: (user: CenterScopeUser) => string[] | null) {
    const targets = sorted.filter(
      (u) => u.role !== "super_admin" && u.hasSwimAccess && sel.has(u.id),
    );
    if (targets.length === 0) return;
    const previous = new Map(targets.map((u) => [u.id, overrideById[u.id] ?? null]));
    const nextById = new Map(targets.map((u) => [u.id, compute(u)] as const));
    setOverrideById((m) => ({ ...m, ...Object.fromEntries(nextById) }));
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map((u) =>
          fetch(`/api/users/${u.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ managedCenters: nextById.get(u.id) }),
          }).then((res) => {
            if (!res.ok) throw new Error(String(res.status));
          }),
        ),
      );
      // Revert ONLY the rows whose PATCH failed; the successful ones keep their
      // optimistic value (it matches what persisted, and router.refresh() can't
      // re-seed this mount-initialized state).
      const failedTargets = targets.filter((_, i) => results[i].status === "rejected");
      if (failedTargets.length > 0) {
        setOverrideById((m) => ({
          ...m,
          ...Object.fromEntries(failedTargets.map((u) => [u.id, previous.get(u.id) ?? null])),
        }));
        toast.error(`${label}: ${failedTargets.length} of ${targets.length} failed.`);
      } else {
        toast.success(`${label} · ${targets.length} accounts.`);
        sel.clear();
      }
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  // Grant restricts to that center (adding it to any existing subset); on an
  // all-centers account it starts the restriction at [center].
  const grantCenter = (center: string) =>
    void bulkApply(`Restricted to ${center}`, (u) =>
      allCenters.filter((c) => c === center || (overrideById[u.id] ?? []).includes(c)),
    );
  const revokeCenter = (center: string) =>
    void bulkApply(`Removed ${center}`, (u) => {
      const next = (overrideById[u.id] ?? []).filter((c) => c !== center);
      return next.length > 0 ? next : null; // empties back to all
    });
  const bulkResetAll = () => void bulkApply("Reset to all centers", () => null);

  const busy = (id: number) => busyId === id || bulkBusy;

  if (allCenters.length === 0) {
    return (
      <Card className="p-4 text-sm text-gray-500">
        No centers are configured yet — add them under Staff → Settings before
        scoping approvals by center.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 text-sm text-gray-500">
        Restrict an admin / supervisor to review, approve, and finalize only for
        the center(s) they manage — their review queues and the KPI-finalize step
        then narrow to those centers. By default an account manages{" "}
        <strong>all centers</strong>; Super Admins always do.
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-900">
          Center scope · {sorted.length}
          {sorted.length !== users.length ? ` of ${users.length}` : ""}{" "}
          {users.length === 1 ? "account" : "accounts"}
        </div>

        {users.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500">
            No accounts can review or finalize yet — grant a review capability on
            the Roles tab first.
          </p>
        ) : (
          <>
            {/* Toolbar: search + filters */}
            <div className="flex flex-col gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2 lg:flex-row lg:items-center">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search name or email…"
                className="lg:max-w-xs"
              />
              <FilterBar active={filtersActive} onClear={resetFilters}>
                <FilterSelect
                  label="Role"
                  value={roleFilter}
                  onChange={(v) => setRoleFilter(v as Role | "")}
                  options={roleOptions}
                  allLabel="All roles"
                />
                <FilterSelect
                  label="Scope"
                  value={scopeFilter}
                  onChange={(v) => setScopeFilter(v as ScopeFilter)}
                  options={[
                    { value: "all", label: "All centers" },
                    { value: "restricted", label: "Restricted" },
                  ]}
                  allLabel="Any"
                />
                <FilterSelect
                  label="Status"
                  value={activeFilter}
                  onChange={(v) => setActiveFilter(v as ActiveFilter)}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                  allLabel="All"
                />
              </FilterBar>
            </div>

            {/* Bulk action bar (selection-driven; scoped to the visible selection). */}
            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-indigo-100 bg-indigo-50/60 px-4 py-2 text-sm">
                <span className="font-semibold text-indigo-800">{selectedCount} selected</span>
                <span className="text-gray-500">Restrict to:</span>
                {allCenters.map((c) => (
                  <Button
                    key={`grant-${c}`}
                    size="sm"
                    variant="outline"
                    disabled={bulkBusy}
                    onClick={() => grantCenter(c)}
                  >
                    + {c}
                  </Button>
                ))}
                <span className="text-gray-500">Remove:</span>
                {allCenters.map((c) => (
                  <Button
                    key={`revoke-${c}`}
                    size="sm"
                    variant="ghost"
                    disabled={bulkBusy}
                    onClick={() => revokeCenter(c)}
                  >
                    − {c}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={bulkResetAll}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to all
                </Button>
                <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={sel.clear}>
                  Clear selection
                </Button>
              </div>
            )}

            <MobileCards>
              {/* Desktop puts select-all in the table header; phones get it here. */}
              {selectableIds.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2">
                  <SelectAllCheckbox
                    state={sel.stateOf(selectableIds)}
                    onChange={(on) => sel.toggleMany(selectableIds, on)}
                    aria-label="Select all accounts"
                  />
                  <span className="text-sm text-gray-600">
                    Select all ({selectableIds.length})
                  </span>
                </div>
              )}
              {sorted.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">No accounts match.</p>
              ) : (
                sorted.map((u) => (
                  <CenterRow
                    key={u.id}
                    user={u}
                    layout="card"
                    allCenters={allCenters}
                    override={overrideById[u.id] ?? null}
                    busy={busy(u.id)}
                    selected={sel.has(u.id)}
                    onSelect={(on) => sel.toggle(u.id, on)}
                    onToggle={(c) => toggle(u, c)}
                    onRestrict={() => setOverrideById((m) => ({ ...m, [u.id]: [] }))}
                    onReset={() => void patchOverride(u, null)}
                  />
                ))
              )}
            </MobileCards>
            <DesktopTable>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="w-10 px-4 py-2 text-center">
                      <SelectAllCheckbox
                        state={sel.stateOf(selectableIds)}
                        onChange={(on) => sel.toggleMany(selectableIds, on)}
                        aria-label="Select all accounts"
                      />
                    </th>
                    <SortTh label="Account" sortKey="account" sort={sort} onSort={toggleSort} />
                    <SortTh label="Role" sortKey="role" sort={sort} onSort={toggleSort} />
                    <th className="px-4 py-2 text-left">Centers</th>
                    <SortTh
                      label="Scope"
                      sortKey="scope"
                      sort={sort}
                      onSort={toggleSort}
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((u) => (
                    <CenterRow
                      key={u.id}
                      user={u}
                      layout="row"
                      allCenters={allCenters}
                      override={overrideById[u.id] ?? null}
                      busy={busy(u.id)}
                      selected={sel.has(u.id)}
                      onSelect={(on) => sel.toggle(u.id, on)}
                      onToggle={(c) => toggle(u, c)}
                      onRestrict={() => setOverrideById((m) => ({ ...m, [u.id]: [] }))}
                      onReset={() => void patchOverride(u, null)}
                    />
                  ))}
                </tbody>
              </table>
            </DesktopTable>
          </>
        )}
      </Card>
    </div>
  );

  function resetFilters() {
    setQuery("");
    setRoleFilter("");
    setScopeFilter("");
    setActiveFilter("");
  }
}

const LOCKED_NOTE = "Always manages every center.";
const NO_SWIM_NOTE = "No swim access — center scope doesn't apply.";

/** Purely presentational — state and mutations live in the parent. */
function CenterRow({
  user,
  layout,
  allCenters,
  override,
  busy,
  selected,
  onSelect,
  onToggle,
  onRestrict,
  onReset,
}: {
  user: CenterScopeUser;
  layout: "card" | "row";
  allCenters: string[];
  override: string[] | null;
  busy: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onToggle: (center: string) => void;
  onRestrict: () => void;
  onReset: () => void;
}) {
  const locked = user.role === "super_admin";
  // Centers are swim-only, so an account without swim access can't reach the
  // review/finalize surfaces this scopes — show the row but disable the control.
  const noSwim = !locked && !user.hasSwimAccess;
  const editing = override !== null;
  const selectedCenters = override ?? [];
  const managesAll = !editing || selectedCenters.length === 0;

  const identity = (
    <>
      <div className={cn("font-medium text-gray-800", !user.active && "line-through")}>
        {user.displayName || user.fullName || user.email}
      </div>
      {user.fullName && user.fullName !== user.displayName && (
        <div className="text-xs text-gray-500">{user.fullName}</div>
      )}
      <div className="text-xs text-gray-400">{user.email}</div>
    </>
  );
  const roleBadge = (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        locked ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-500",
      )}
    >
      {ROLE_LABELS[user.role]}
    </span>
  );
  const stateBadge = locked ? null : (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        managesAll ? "bg-gray-100 text-gray-500" : "bg-amber-50 text-amber-700",
      )}
    >
      {managesAll
        ? "Manages all centers"
        : `Manages ${selectedCenters.length} of ${allCenters.length}`}
    </span>
  );
  const action = locked ? null : !editing ? (
    <Button size="sm" variant="outline" disabled={busy} onClick={onRestrict}>
      Restrict to centers
    </Button>
  ) : (
    <Button size="sm" variant="ghost" disabled={busy} onClick={onReset}>
      <RotateCcw className="h-3.5 w-3.5" /> Reset to all centers
    </Button>
  );
  const chips = (
    <div className="flex flex-wrap gap-2">
      {allCenters.map((c) => (
        <CenterChip
          key={c}
          center={c}
          checked={selectedCenters.includes(c)}
          disabled={busy}
          onToggle={() => onToggle(c)}
        />
      ))}
    </div>
  );
  const emptyHint =
    editing && selectedCenters.length === 0 ? (
      <p className="text-xs text-amber-600">
        No centers selected yet — pick the centers this account manages (none means all).
      </p>
    ) : null;

  const selectBox = !locked && !noSwim && (
    <input
      type="checkbox"
      className="h-4 w-4 accent-indigo-600"
      checked={selected}
      onChange={(e) => onSelect(e.target.checked)}
      aria-label={`Select ${user.displayName || user.email}`}
    />
  );

  if (layout === "card") {
    return (
      <div className={cn("space-y-2 p-4", busy && "opacity-60")}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {selectBox && <div className="mt-1">{selectBox}</div>}
            <div>{identity}</div>
          </div>
          {roleBadge}
        </div>
        {locked ? (
          <p className="text-xs text-gray-400">{LOCKED_NOTE}</p>
        ) : noSwim ? (
          <p className="text-xs text-gray-400">{NO_SWIM_NOTE}</p>
        ) : (
          <>
            <div>{stateBadge}</div>
            {editing ? (
              <>
                {chips}
                {emptyHint}
              </>
            ) : (
              <p className="text-xs text-gray-400">All centers.</p>
            )}
            <div className="pt-1">{action}</div>
          </>
        )}
      </div>
    );
  }

  return (
    <tr className={busy ? "opacity-60" : undefined}>
      <td className="px-4 py-2 text-center align-top">{selectBox}</td>
      <td className="px-4 py-2 align-top">{identity}</td>
      <td className="px-4 py-2 align-top">{roleBadge}</td>
      {locked ? (
        <td colSpan={2} className="px-4 py-2 text-center text-xs text-gray-400">
          {LOCKED_NOTE}
        </td>
      ) : noSwim ? (
        <td colSpan={2} className="px-4 py-2 text-center text-xs text-gray-400">
          {NO_SWIM_NOTE}
        </td>
      ) : (
        <>
          <td className="px-4 py-2 align-top">
            {editing ? (
              <div className="space-y-1.5">
                {chips}
                {emptyHint}
              </div>
            ) : (
              <span className="text-xs text-gray-400">All centers</span>
            )}
          </td>
          <td className="px-4 py-2 align-top">
            <div className="flex items-center justify-end gap-2">
              {stateBadge}
              {action}
            </div>
          </td>
        </>
      )}
    </tr>
  );
}

/** Tappable center pill (mirrors the category chip). */
function CenterChip({
  center,
  checked,
  disabled,
  onToggle,
}: {
  center: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={checked}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
        checked
          ? "border-indigo-600 bg-indigo-600 text-white"
          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300",
      )}
    >
      {center}
    </button>
  );
}
