"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
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
  role: Role;
  /** Stored per-user override; null = inherits the role's default categories. */
  visibleCategories: ToolCategory[] | null;
  active: boolean;
}

/**
 * System Setting → Permissions → "User overrides": per-account launcher
 * categories. Every row shows the EFFECTIVE list (override ?? role default);
 * by default a row "Inherits from role", and an Override action pins the
 * account to an explicit list (Reset returns it to inheriting). super_admin
 * rows are locked — they always see every category.
 *
 * All mutation state lives HERE (not in the per-user rows): each user renders
 * twice (mobile card + desktop row, per responsive-table.tsx), so row-local
 * state would fork between the two mounts. Updates are optimistic — the
 * override flips immediately and reverts on failure — and the row stays
 * disabled while its PATCH is in flight so a quick second tap can't compute
 * the next list from stale data.
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
  // Last override we know per user; starts from server props, updated optimistically.
  const [overrideById, setOverrideById] = useState<Record<number, ToolCategory[] | null>>(
    () =>
      Object.fromEntries(
        // Sanitize so a stale/hand-edited DB value can't make every subsequent
        // PATCH fail validation (self-heals on the next save).
        users.map((u) => [u.id, sanitizeToolCategories(u.visibleCategories)]),
      ),
  );
  const [busyId, setBusyId] = useState<number | null>(null);

  function effectiveFor(user: OverrideUser): ToolCategory[] {
    return effectiveCategories(user.role, overrideById[user.id], roleDefaults);
  }

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

  function toggle(user: OverrideUser, category: ToolCategory) {
    const current = overrideById[user.id];
    if (!current) return; // inheriting — Override must be enabled first
    const next = current.includes(category)
      ? current.filter((c) => c !== category)
      : TOOL_CATEGORIES.filter((c) => c === category || current.includes(c));
    void patchOverride(user, next);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 text-sm text-gray-500">
        Each account inherits its role&apos;s launcher categories (the Roles tab).
        Override an account to pin a different list — e.g. one gym admin who also
        needs <strong>{TOOL_CATEGORY_LABELS.swim}</strong>. Capabilities still apply
        within a category; Super Admins always see everything.
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-900">
          User overrides · {users.length} accounts
        </div>
        <MobileCards>
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              layout="card"
              override={overrideById[u.id] ?? null}
              effective={effectiveFor(u)}
              busy={busyId === u.id}
              onToggle={(c) => toggle(u, c)}
              onOverride={() => void patchOverride(u, effectiveFor(u))}
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
                {TOOL_CATEGORIES.map((c) => (
                  <th key={c} className="px-4 py-2 text-center">
                    {TOOL_CATEGORY_LABELS[c]}
                  </th>
                ))}
                <th className="px-4 py-2 text-right">Visibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  layout="row"
                  override={overrideById[u.id] ?? null}
                  effective={effectiveFor(u)}
                  busy={busyId === u.id}
                  onToggle={(c) => toggle(u, c)}
                  onOverride={() => void patchOverride(u, effectiveFor(u))}
                  onReset={() => void patchOverride(u, null)}
                />
              ))}
            </tbody>
          </table>
        </DesktopTable>
      </Card>
    </div>
  );
}

const LOCKED_NOTE = "Always sees every category.";

/** Purely presentational — state and mutations live in the parent. */
function UserRow({
  user,
  layout,
  override,
  effective,
  busy,
  onToggle,
  onOverride,
  onReset,
}: {
  user: OverrideUser;
  layout: "card" | "row";
  override: ToolCategory[] | null;
  effective: ToolCategory[];
  busy: boolean;
  onToggle: (category: ToolCategory) => void;
  onOverride: () => void;
  onReset: () => void;
}) {
  const locked = user.role === "super_admin";
  const inheriting = override === null;

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
        inheriting ? "bg-gray-100 text-gray-500" : "bg-amber-50 text-amber-700",
      )}
    >
      {inheriting ? `Inherits from ${ROLE_LABELS[user.role]}` : "Override"}
    </span>
  );
  const action = locked ? null : inheriting ? (
    <Button size="sm" variant="outline" disabled={busy} onClick={onOverride}>
      Override
    </Button>
  ) : (
    <Button size="sm" variant="ghost" disabled={busy} onClick={onReset}>
      <RotateCcw className="h-3.5 w-3.5" /> Reset to role default
    </Button>
  );

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
            <div className="flex flex-wrap gap-2">
              {TOOL_CATEGORIES.map((c) => (
                <CategoryChip
                  key={c}
                  category={c}
                  checked={effective.includes(c)}
                  // Inherited chips display the role default; tap Override to edit.
                  disabled={busy || inheriting}
                  onToggle={() => onToggle(c)}
                />
              ))}
            </div>
            <div className="pt-1">{action}</div>
          </>
        )}
      </div>
    );
  }

  return (
    <tr className={busy ? "opacity-60" : undefined}>
      <td className="px-4 py-2">{identity}</td>
      <td className="px-4 py-2">{roleBadge}</td>
      {locked ? (
        <td
          colSpan={TOOL_CATEGORIES.length + 1}
          className="px-4 py-2 text-center text-xs text-gray-400"
        >
          {LOCKED_NOTE}
        </td>
      ) : (
        <>
          {TOOL_CATEGORIES.map((c) => (
            <td key={c} className="px-4 py-2 text-center">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600 disabled:opacity-50"
                checked={effective.includes(c)}
                disabled={busy || inheriting}
                onChange={() => onToggle(c)}
                title={
                  inheriting
                    ? `${TOOL_CATEGORY_LABELS[c]} — from the ${ROLE_LABELS[user.role]} role default`
                    : TOOL_CATEGORY_LABELS[c]
                }
              />
            </td>
          ))}
          <td className="px-4 py-2">
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
