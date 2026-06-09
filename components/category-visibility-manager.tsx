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
 */
export function CategoryVisibilityManager({ users }: { users: CategoryUser[] }) {
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
            <UserCategories key={u.id} user={u} layout="card" />
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
                <UserCategories key={u.id} user={u} layout="row" />
              ))}
            </tbody>
          </table>
        </DesktopTable>
      </Card>
    </div>
  );
}

function UserCategories({ user, layout }: { user: CategoryUser; layout: "card" | "row" }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const locked = user.role === "super_admin";
  const selected = locked ? [...TOOL_CATEGORIES] : user.visibleCategories;

  async function toggle(category: ToolCategory) {
    const next = selected.includes(category)
      ? selected.filter((c) => c !== category)
      : [...selected, category];
    setBusy(true);
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
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

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
          <p className="text-xs text-gray-400">Always sees every category.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {TOOL_CATEGORIES.map((c) => (
              <CategoryChip
                key={c}
                category={c}
                checked={selected.includes(c)}
                disabled={busy}
                onToggle={() => toggle(c)}
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
      {TOOL_CATEGORIES.map((c) => (
        <td key={c} className="px-4 py-2 text-center">
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-600 disabled:opacity-50"
            checked={selected.includes(c)}
            disabled={busy || locked}
            onChange={() => toggle(c)}
            title={
              locked
                ? "Super Admins always see every category"
                : TOOL_CATEGORY_LABELS[c]
            }
          />
        </td>
      ))}
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
