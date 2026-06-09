"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import {
  ROLE_LABELS,
  TOOL_CATEGORIES,
  TOOL_CATEGORY_LABELS,
  type Role,
  type ToolCategory,
} from "@/lib/auth/types";
import { cn } from "@/lib/utils";

export interface CategoryUser {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  visibleCategories: ToolCategory[];
  active: boolean;
}

/**
 * System Setting → Category Visibility: per-account checkboxes for which home
 * launcher groups (Swim / Fit / Marketing) the user sees. super_admin rows are
 * locked — they always see every category.
 *
 * All mutation state lives HERE (not in the per-user rows): each user renders
 * twice (mobile card + desktop row, per responsive-table.tsx), so row-local
 * state would fork between the two mounts. Updates are optimistic — `selected`
 * flips immediately and reverts on failure — and the row stays disabled while
 * its PATCH is in flight so a quick second tap can't compute the next list
 * from stale data.
 */
export function CategoryVisibilityManager({ users }: { users: CategoryUser[] }) {
  const router = useRouter();
  const toast = useToast();
  // Last list we know per user; starts from server props, updated optimistically.
  const [selectedById, setSelectedById] = useState<Record<number, ToolCategory[]>>(
    () =>
      Object.fromEntries(
        // Intersect with the known set so a stale/hand-edited DB value can't
        // make every subsequent PATCH fail validation (self-heals on next save).
        users.map((u) => [u.id, TOOL_CATEGORIES.filter((c) => u.visibleCategories.includes(c))]),
      ),
  );
  const [busyId, setBusyId] = useState<number | null>(null);

  async function toggle(user: CategoryUser, category: ToolCategory) {
    const current = selectedById[user.id] ?? [];
    const next = current.includes(category)
      ? current.filter((c) => c !== category)
      : TOOL_CATEGORIES.filter((c) => c === category || current.includes(c));
    setSelectedById((m) => ({ ...m, [user.id]: next }));
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
      setSelectedById((m) => ({ ...m, [user.id]: current }));
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 text-sm text-gray-500">
        Choose which home-screen categories each account can see — e.g. swim staff
        only <strong>{TOOL_CATEGORY_LABELS.swim}</strong>, gym staff only{" "}
        <strong>{TOOL_CATEGORY_LABELS.fit}</strong>. Capabilities still apply within
        a category; Super Admins always see everything.
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-900">
          Category visibility · {users.length} accounts
        </div>
        <MobileCards>
          {users.map((u) => (
            <UserCategories
              key={u.id}
              user={u}
              layout="card"
              selected={selectedById[u.id] ?? []}
              busy={busyId === u.id}
              onToggle={(c) => toggle(u, c)}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <UserCategories
                  key={u.id}
                  user={u}
                  layout="row"
                  selected={selectedById[u.id] ?? []}
                  busy={busyId === u.id}
                  onToggle={(c) => toggle(u, c)}
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
function UserCategories({
  user,
  layout,
  selected,
  busy,
  onToggle,
}: {
  user: CategoryUser;
  layout: "card" | "row";
  selected: ToolCategory[];
  busy: boolean;
  onToggle: (category: ToolCategory) => void;
}) {
  const locked = user.role === "super_admin";

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
          <div className="flex flex-wrap gap-2">
            {TOOL_CATEGORIES.map((c) => (
              <CategoryChip
                key={c}
                category={c}
                checked={selected.includes(c)}
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
              checked={selected.includes(c)}
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
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
        checked
          ? "border-indigo-600 bg-indigo-600 text-white"
          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300",
      )}
    >
      {TOOL_CATEGORY_LABELS[category]}
    </button>
  );
}
