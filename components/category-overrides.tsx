"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  triState,
  useRowSelection,
  useTableSort,
  type TriState,
} from "@/components/table-controls";
import {
  ROLE_LABELS,
  TOOL_CATEGORIES,
  TOOL_CATEGORY_LABELS,
  effectiveCategories,
  sanitizeToolCategories,
  type PermissionConfig,
  type Role,
  type ToolCategory,
} from "@/lib/auth/types";
import { cn } from "@/lib/utils";

export interface OverrideUser {
  id: number;
  email: string;
  displayName: string;
  fullName: string;
  role: Role;
  /** Stored per-user list of launcher categories; null/[] = no access (deny). */
  visibleCategories: ToolCategory[] | null;
  active: boolean;
}

type AccessFilter = "" | "has" | "none";
type ActiveFilter = "" | "active" | "inactive";
type SortKey = "account" | "role";

/**
 * System Setting → Permissions → "Per-account access": per-account launcher
 * categories. Launcher visibility is **default-deny** (Backlog G) — there are no
 * editable per-role defaults; a new account sees no department until a category
 * is ticked here. Each row's category checkboxes write the account's
 * `visibleCategories` directly (empty → null = no access). super_admin rows are
 * locked — they always see every category.
 *
 * The list ships the standard Search + Sort + Filter controls plus a select-all
 * and a bulk action bar (grant/revoke a category or clear access across the
 * selected rows) — built on the shared `table-controls` kit. Each category
 * COLUMN header also carries a tri-state one-click toggle that grants/revokes
 * that one category for ALL visible accounts at once (the "too many accounts"
 * shortcut, independent of row selection; scoped to the current filter).
 *
 * All mutation state lives HERE (not in the per-user rows): each user renders
 * twice (mobile card + desktop row), so row-local state would fork between the
 * two mounts. Updates are optimistic — the categories flip immediately and
 * revert on failure — and the row stays disabled while its PATCH is in flight.
 */
export function CategoryOverrides({
  users,
  roleDefaults,
}: {
  users: OverrideUser[];
  roleDefaults: PermissionConfig["categories"];
}) {
  const router = useRouter();
  const toast = useToast();
  // Last categories we know per user; starts from server props, updated optimistically.
  const [overrideById, setOverrideById] = useState<Record<number, ToolCategory[] | null>>(
    () =>
      Object.fromEntries(
        // Sanitize so a stale/hand-edited DB value can't make every subsequent
        // PATCH fail validation (self-heals on the next save).
        users.map((u) => [u.id, sanitizeToolCategories(u.visibleCategories)]),
      ),
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const sel = useRowSelection<number>();

  // ── List controls ────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("");

  const roleOptions = useMemo(() => {
    const present = Array.from(new Set(users.map((u) => u.role)));
    return present.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  }, [users]);

  function effectiveFor(user: OverrideUser): ToolCategory[] {
    return effectiveCategories(user.role, overrideById[user.id], roleDefaults);
  }

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const hay = `${u.displayName} ${u.fullName} ${u.email}`;
      if (!includesText(hay, query)) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (activeFilter && (activeFilter === "active") !== u.active) return false;
      if (accessFilter) {
        if (u.role === "super_admin") return accessFilter === "has"; // always has access
        const hasAccess = effectiveFor(u).length > 0;
        if (accessFilter === "has" && !hasAccess) return false;
        if (accessFilter === "none" && hasAccess) return false;
      }
      return true;
    });
    // overrideById feeds the access filter; recompute when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, query, roleFilter, accessFilter, activeFilter, overrideById]);

  const { sorted, sort, toggleSort } = useTableSort<OverrideUser, SortKey>(filtered, {
    account: (u) => u.displayName || u.fullName || u.email,
    role: (u) => ROLE_LABELS[u.role],
  });

  // Only non-super-admin rows are selectable (locked rows can't be narrowed).
  const selectableIds = useMemo(
    () => sorted.filter((u) => u.role !== "super_admin").map((u) => u.id),
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
    query !== "" || roleFilter !== "" || accessFilter !== "" || activeFilter !== "";

  async function patchOverride(user: OverrideUser, next: ToolCategory[] | null) {
    const previous = overrideById[user.id] ?? null;
    setOverrideById((m) => ({ ...m, [user.id]: next }));
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibleCategories: next }),
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

  /** Toggle one category for one account — writes the full list (empty → null = deny). */
  function toggle(user: OverrideUser, category: ToolCategory) {
    if (user.role === "super_admin") return;
    const current = effectiveFor(user);
    const nextList = current.includes(category)
      ? current.filter((c) => c !== category)
      : TOOL_CATEGORIES.filter((c) => c === category || current.includes(c));
    void patchOverride(user, nextList.length ? nextList : null);
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────
  /** Optimistically PATCH a category list onto each target, reverting only the
   *  rows whose write failed. Shared by the selection-driven bar AND the
   *  per-column header toggles. Returns true when every write succeeded. */
  async function applyToTargets(
    targets: OverrideUser[],
    label: string,
    compute: (user: OverrideUser) => ToolCategory[] | null,
  ): Promise<boolean> {
    if (targets.length === 0) return false;
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
            body: JSON.stringify({ visibleCategories: nextById.get(u.id) }),
          }).then((res) => {
            if (!res.ok) throw new Error(String(res.status));
          }),
        ),
      );
      // Revert ONLY the rows whose PATCH failed; the successful ones keep their
      // optimistic value (router.refresh() can't re-seed this mounted state).
      const failedTargets = targets.filter((_, i) => results[i].status === "rejected");
      if (failedTargets.length > 0) {
        setOverrideById((m) => ({
          ...m,
          ...Object.fromEntries(failedTargets.map((u) => [u.id, previous.get(u.id) ?? null])),
        }));
        toast.error(`${label}: ${failedTargets.length} of ${targets.length} failed.`);
        router.refresh();
        return false;
      }
      toast.success(`${label} · ${targets.length} accounts.`);
      router.refresh();
      return true;
    } finally {
      setBulkBusy(false);
    }
  }

  // Selection-driven bar: operate on the currently-selected visible rows.
  async function bulkApply(label: string, compute: (user: OverrideUser) => ToolCategory[] | null) {
    const targets = sorted.filter((u) => u.role !== "super_admin" && sel.has(u.id));
    if (await applyToTargets(targets, label, compute)) sel.clear();
  }

  const grantCategory = (category: ToolCategory) =>
    void bulkApply(`Granted ${TOOL_CATEGORY_LABELS[category]}`, (u) =>
      TOOL_CATEGORIES.filter((c) => c === category || effectiveFor(u).includes(c)),
    );
  const revokeCategory = (category: ToolCategory) =>
    void bulkApply(`Revoked ${TOOL_CATEGORY_LABELS[category]}`, (u) => {
      const next = effectiveFor(u).filter((c) => c !== category);
      return next.length ? next : null;
    });
  const clearAccess = () => void bulkApply("Cleared access", () => null);

  // ── Per-column one-click: grant/revoke one category for ALL visible accounts ──
  // (the "too many accounts" shortcut — independent of row selection, scoped to
  // the current filter via `sorted`). super_admin rows are excluded (always all).
  const columnTargets = useMemo(
    () => sorted.filter((u) => u.role !== "super_admin"),
    [sorted],
  );
  const categoryColumnState = (category: ToolCategory): TriState => {
    const have = columnTargets.reduce(
      (n, u) => (effectiveFor(u).includes(category) ? n + 1 : n),
      0,
    );
    return triState(have, columnTargets.length);
  };
  const toggleCategoryColumn = (category: ToolCategory, grant: boolean) =>
    void applyToTargets(
      columnTargets,
      grant
        ? `Granted ${TOOL_CATEGORY_LABELS[category]} to all`
        : `Revoked ${TOOL_CATEGORY_LABELS[category]} from all`,
      grant
        ? (u) => TOOL_CATEGORIES.filter((c) => c === category || effectiveFor(u).includes(c))
        : (u) => {
            const next = effectiveFor(u).filter((c) => c !== category);
            return next.length ? next : null;
          },
    );

  const busy = (id: number) => busyId === id || bulkBusy;

  return (
    <div className="space-y-4">
      <Card className="p-4 text-sm text-gray-500">
        Launcher visibility is <strong>default-deny</strong>: a new account sees no
        department until you tick a category here. Tick the launcher categories
        (<strong>{TOOL_CATEGORY_LABELS.swim}</strong> / {TOOL_CATEGORY_LABELS.fit} /{" "}
        {TOOL_CATEGORY_LABELS.marketing}) each account should see. Capabilities still
        apply within a category; Super Admins always see everything.
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-900">
          Launcher categories · {sorted.length}
          {sorted.length !== users.length ? ` of ${users.length}` : ""} accounts
        </div>

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
              label="Access"
              value={accessFilter}
              onChange={(v) => setAccessFilter(v as AccessFilter)}
              options={[
                { value: "has", label: "Has access" },
                { value: "none", label: "No access" },
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
            <span className="text-gray-500">Grant:</span>
            {TOOL_CATEGORIES.map((c) => (
              <Button
                key={`grant-${c}`}
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => grantCategory(c)}
              >
                + {TOOL_CATEGORY_LABELS[c]}
              </Button>
            ))}
            <span className="text-gray-500">Revoke:</span>
            {TOOL_CATEGORIES.map((c) => (
              <Button
                key={`revoke-${c}`}
                size="sm"
                variant="ghost"
                disabled={bulkBusy}
                onClick={() => revokeCategory(c)}
              >
                − {TOOL_CATEGORY_LABELS[c]}
              </Button>
            ))}
            <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={clearAccess}>
              Clear access
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
              <span className="text-sm text-gray-600">Select all ({selectableIds.length})</span>
            </div>
          )}
          {/* Per-category one-click over ALL visible accounts (phones have no
              column headers — this is the desktop header toggles' equivalent). */}
          {columnTargets.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-100 bg-gray-50/40 px-4 py-2 text-sm">
              <span className="text-gray-500">All {columnTargets.length}:</span>
              {TOOL_CATEGORIES.map((c) => (
                <label key={`col-${c}`} className="flex items-center gap-1.5">
                  <SelectAllCheckbox
                    state={categoryColumnState(c)}
                    onChange={(on) => toggleCategoryColumn(c, on)}
                    className={bulkBusy ? "opacity-50" : undefined}
                    aria-label={`Give ${TOOL_CATEGORY_LABELS[c]} to all ${columnTargets.length} visible accounts`}
                  />
                  <span className="text-gray-600">{TOOL_CATEGORY_LABELS[c]}</span>
                </label>
              ))}
            </div>
          )}
          {sorted.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">No accounts match.</p>
          ) : (
            sorted.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                layout="card"
                effective={effectiveFor(u)}
                busy={busy(u.id)}
                selected={sel.has(u.id)}
                onSelect={(on) => sel.toggle(u.id, on)}
                onToggle={(c) => toggle(u, c)}
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
                {TOOL_CATEGORIES.map((c) => (
                  <th key={c} className="px-4 py-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span>{TOOL_CATEGORY_LABELS[c]}</span>
                      {columnTargets.length > 0 && (
                        <SelectAllCheckbox
                          state={categoryColumnState(c)}
                          onChange={(on) => toggleCategoryColumn(c, on)}
                          className={bulkBusy ? "opacity-50" : undefined}
                          aria-label={`Give ${TOOL_CATEGORY_LABELS[c]} to all ${columnTargets.length} visible accounts`}
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  layout="row"
                  effective={effectiveFor(u)}
                  busy={busy(u.id)}
                  selected={sel.has(u.id)}
                  onSelect={(on) => sel.toggle(u.id, on)}
                  onToggle={(c) => toggle(u, c)}
                />
              ))}
            </tbody>
          </table>
        </DesktopTable>
      </Card>
    </div>
  );

  function resetFilters() {
    setQuery("");
    setRoleFilter("");
    setAccessFilter("");
    setActiveFilter("");
  }
}

const LOCKED_NOTE = "Always sees every category.";

/** Purely presentational — state and mutations live in the parent. */
function UserRow({
  user,
  layout,
  effective,
  busy,
  selected,
  onSelect,
  onToggle,
}: {
  user: OverrideUser;
  layout: "card" | "row";
  effective: ToolCategory[];
  busy: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onToggle: (category: ToolCategory) => void;
}) {
  const locked = user.role === "super_admin";

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

  if (layout === "card") {
    return (
      <div className={cn("space-y-2 p-4", busy && "opacity-60")}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {!locked && (
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-indigo-600"
                checked={selected}
                onChange={(e) => onSelect(e.target.checked)}
                aria-label={`Select ${user.displayName || user.email}`}
              />
            )}
            <div>{identity}</div>
          </div>
          {roleBadge}
        </div>
        {locked ? (
          <p className="text-xs text-gray-400">{LOCKED_NOTE}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {TOOL_CATEGORIES.map((c) => (
              <CategoryChip
                key={c}
                category={c}
                checked={effective.includes(c)}
                disabled={busy}
                onToggle={() => onToggle(c)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <tr className={busy ? "opacity-60" : undefined}>
      <td className="px-4 py-2 text-center">
        {!locked && (
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-600"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select ${user.displayName || user.email}`}
          />
        )}
      </td>
      <td className="px-4 py-2">{identity}</td>
      <td className="px-4 py-2">{roleBadge}</td>
      {locked ? (
        <td colSpan={TOOL_CATEGORIES.length} className="px-4 py-2 text-center text-xs text-gray-400">
          {LOCKED_NOTE}
        </td>
      ) : (
        TOOL_CATEGORIES.map((c) => (
          <td key={c} className="px-4 py-2 text-center">
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600 disabled:opacity-50"
              checked={effective.includes(c)}
              disabled={busy}
              onChange={() => onToggle(c)}
              title={TOOL_CATEGORY_LABELS[c]}
            />
          </td>
        ))
      )}
    </tr>
  );
}

/** Tappable category pill for the mobile card stack (checkboxes are too small). */
function CategoryChip({
  category,
  checked,
  disabled,
  onToggle,
}: {
  category: ToolCategory;
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
      {TOOL_CATEGORY_LABELS[category]}
    </button>
  );
}
