"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { ROLE_LABELS, type Role } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

export interface CenterScopeUser {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  /** Stored per-user override; null/empty = manages ALL centers. */
  managedCenters: string[] | null;
  active: boolean;
}

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
 * System Setting → Permissions → "User overrides": per-account CENTER scope for
 * approvals (timesheet + lesson-plan review, KPI finalize). By default an
 * account "Manages all centers"; "Restrict" reveals the center chips so it can
 * be pinned to a subset (Reset returns it to all). super_admin rows are locked —
 * they always manage every center. Only accounts whose role can review/finalize
 * are passed in.
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
          Center scope · {users.length} {users.length === 1 ? "account" : "accounts"}
        </div>
        {users.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500">
            No accounts can review or finalize yet — grant a review capability on
            the Roles tab first.
          </p>
        ) : (
          <>
            <MobileCards>
              {users.map((u) => (
                <CenterRow
                  key={u.id}
                  user={u}
                  layout="card"
                  allCenters={allCenters}
                  override={overrideById[u.id] ?? null}
                  busy={busyId === u.id}
                  onToggle={(c) => toggle(u, c)}
                  onRestrict={() => setOverrideById((m) => ({ ...m, [u.id]: [] }))}
                  onReset={() => void patchOverride(u, null)}
                />
              ))}
            </MobileCards>
            <DesktopTable>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Account</th>
                    <th className="px-4 py-2 text-left">Role</th>
                    <th className="px-4 py-2 text-left">Centers</th>
                    <th className="px-4 py-2 text-right">Scope</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => (
                    <CenterRow
                      key={u.id}
                      user={u}
                      layout="row"
                      allCenters={allCenters}
                      override={overrideById[u.id] ?? null}
                      busy={busyId === u.id}
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
}

const LOCKED_NOTE = "Always manages every center.";

/** Purely presentational — state and mutations live in the parent. */
function CenterRow({
  user,
  layout,
  allCenters,
  override,
  busy,
  onToggle,
  onRestrict,
  onReset,
}: {
  user: CenterScopeUser;
  layout: "card" | "row";
  allCenters: string[];
  override: string[] | null;
  busy: boolean;
  onToggle: (center: string) => void;
  onRestrict: () => void;
  onReset: () => void;
}) {
  const locked = user.role === "super_admin";
  const editing = override !== null;
  const selected = override ?? [];
  const managesAll = !editing || selected.length === 0;

  const identity = (
    <>
      <div className={cn("font-medium text-gray-800", !user.active && "line-through")}>
        {user.displayName || user.email}
      </div>
      {user.displayName && <div className="text-xs text-gray-400">{user.email}</div>}
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
      {managesAll ? "Manages all centers" : `Manages ${selected.length} of ${allCenters.length}`}
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
          checked={selected.includes(c)}
          disabled={busy}
          onToggle={() => onToggle(c)}
        />
      ))}
    </div>
  );
  const emptyHint =
    editing && selected.length === 0 ? (
      <p className="text-xs text-amber-600">
        No centers selected yet — pick the centers this account manages (none means all).
      </p>
    ) : null;

  if (layout === "card") {
    return (
      <div className={cn("space-y-2 p-4", busy && "opacity-60")}>
        <div className="flex items-start justify-between gap-2">
          <div>{identity}</div>
          {roleBadge}
        </div>
        {locked ? (
          <p className="text-xs text-gray-400">{LOCKED_NOTE}</p>
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
      <td className="px-4 py-2 align-top">{identity}</td>
      <td className="px-4 py-2 align-top">{roleBadge}</td>
      {locked ? (
        <td colSpan={2} className="px-4 py-2 text-center text-xs text-gray-400">
          {LOCKED_NOTE}
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
