"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Save, ShieldCheck } from "lucide-react";
import { Button, Card, Spinner } from "@/components/ui";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { useToast } from "@/components/toast";
import { CategoryOverrides, type OverrideUser } from "@/components/category-overrides";
import { CenterOverrides, type CenterScopeUser } from "@/components/center-overrides";
import {
  CAPABILITY_LABELS,
  CONFIGURABLE_ROLES,
  ROLE_LABELS,
  TOOL_CATEGORIES,
  TOOL_CATEGORY_LABELS,
  type Capability,
  type ConfigurableRole,
  type PermissionConfig,
  type ToolCategory,
} from "@/lib/auth/types";
import { cn } from "@/lib/utils";

type CapGroup = { title: string; caps: Capability[]; emptyNote?: string };

/** Capability groups, by brand — mirrors the launcher's brand sections. */
const GROUPS: CapGroup[] = [
  { title: "Shared", caps: ["view_own", "manage_users", "view_audit"] },
  {
    title: TOOL_CATEGORY_LABELS.swim,
    caps: [
      "swim_view_staff",
      "swim_edit_staff",
      "edit_appraisals",
      "edit_notes",
      "edit_lesson_plans",
      "review_lesson_plans",
      "run_kpi",
      "finalize_kpi",
      "run_allowance",
      "run_freelancer",
      "swim_view_settings",
      "swim_edit_settings",
    ],
  },
  {
    title: TOOL_CATEGORY_LABELS.fit,
    caps: ["fit_view_staff", "fit_edit_staff", "run_commission", "fit_view_settings", "fit_edit_settings"],
  },
  {
    title: TOOL_CATEGORY_LABELS.marketing,
    caps: [],
    emptyNote: "No capabilities yet — the marketing module is coming soon.",
  },
];

const CATEGORIES_GROUP_TITLE = "Launcher categories";

type Tab = "roles" | "overrides";

/**
 * System Setting → Permissions: one page for the whole access model.
 * "Roles" = the role → capability matrix plus per-role default launcher
 * categories; "User overrides" = per-account category overrides (an account
 * inherits its role's defaults until explicitly overridden).
 */
export function PermissionsForm({
  initial,
  users,
  centerUsers,
  allCenters,
}: {
  initial: PermissionConfig;
  users: OverrideUser[];
  centerUsers: CenterScopeUser[];
  allCenters: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("roles");
  const [cfg, setCfg] = useState<PermissionConfig>(() => structuredClone(initial));
  const [busy, setBusy] = useState(false);
  // Mobile shows one role at a time (the full matrix doesn't fit a phone).
  const [mobileRole, setMobileRole] = useState<ConfigurableRole>(CONFIGURABLE_ROLES[0]);

  function toggleCap(role: ConfigurableRole, cap: Capability) {
    setCfg((c) => {
      const has = c.capabilities[role].includes(cap);
      return {
        ...c,
        capabilities: {
          ...c.capabilities,
          [role]: has
            ? c.capabilities[role].filter((x) => x !== cap)
            : [...c.capabilities[role], cap],
        },
      };
    });
  }

  function toggleCat(role: ConfigurableRole, category: ToolCategory) {
    setCfg((c) => {
      const has = c.categories[role].includes(category);
      return {
        ...c,
        categories: {
          ...c.categories,
          [role]: has
            ? c.categories[role].filter((x) => x !== category)
            : // Keep canonical order so saved lists stay comparable.
              TOOL_CATEGORIES.filter((x) => x === category || c.categories[role].includes(x)),
        },
      };
    });
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Save failed");
      }
      toast.success("Permissions saved.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <ShieldCheck className="h-5 w-5 text-indigo-500" /> Permissions
        </h1>
        {tab === "roles" && (
          <Button onClick={save} disabled={busy}>
            {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save
          </Button>
        )}
      </div>

      {/* Segmented control (same chrome as the mobile role tabs below). */}
      <div className="grid max-w-sm grid-cols-2 gap-2" role="tablist" aria-label="Permissions view">
        {(
          [
            { id: "roles", label: "Roles" },
            { id: "overrides", label: "User overrides" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-11 rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
              tab === t.id
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-gray-200 bg-white text-gray-600 active:bg-gray-100",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overrides" ? (
        <div className="space-y-8">
          <CategoryOverrides users={users} roleDefaults={initial.categories} />
          <CenterOverrides users={centerUsers} allCenters={allCenters} />
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Choose which capabilities and launcher categories each role has by default.
            Super Admin always has full access and cannot be changed.
          </p>

          <Card className="overflow-hidden p-0">
            {/* Mobile (< lg): pick a role, then toggle its capabilities as a
                stacked touch list. Desktop keeps the full capability × role matrix. */}
            <MobileCards>
              <div className="p-4">
                <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Role">
                  {CONFIGURABLE_ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={mobileRole === r}
                      onClick={() => setMobileRole(r)}
                      className={cn(
                        "min-h-11 rounded-lg border px-2 py-1.5 text-sm font-semibold transition",
                        mobileRole === r
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-gray-200 bg-white text-gray-600 active:bg-gray-100",
                      )}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Editing capabilities for <strong>{ROLE_LABELS[mobileRole]}</strong>.{" "}
                  {ROLE_LABELS.super_admin} always has every capability.
                </p>
              </div>
              {GROUPS.map((group) => (
                <div key={group.title} className="px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                    {group.title}
                  </div>
                  <div className="mt-1">
                    {group.caps.length === 0 && (
                      <p className="py-1.5 text-sm text-gray-400">{group.emptyNote}</p>
                    )}
                    {group.caps.map((cap) => (
                      <label
                        key={cap}
                        className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1.5"
                      >
                        <span className="text-sm text-gray-700">{CAPABILITY_LABELS[cap]}</span>
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 accent-indigo-600"
                          checked={cfg.capabilities[mobileRole].includes(cap)}
                          onChange={() => toggleCap(mobileRole, cap)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <LayoutGrid className="h-3.5 w-3.5" /> {CATEGORIES_GROUP_TITLE}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Home-screen groups {ROLE_LABELS[mobileRole]} accounts see by default
                  (per-user overrides win).
                </p>
                <div className="mt-1">
                  {TOOL_CATEGORIES.map((category) => (
                    <label
                      key={category}
                      className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1.5"
                    >
                      <span className="text-sm text-gray-700">
                        {TOOL_CATEGORY_LABELS[category]}
                      </span>
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0 accent-indigo-600"
                        checked={cfg.categories[mobileRole].includes(category)}
                        onChange={() => toggleCat(mobileRole, category)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </MobileCards>
            <DesktopTable>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Capability</th>
                    {CONFIGURABLE_ROLES.map((r) => (
                      <th key={r} className="px-4 py-2 text-center">
                        {ROLE_LABELS[r]}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-center text-gray-400">
                      {ROLE_LABELS.super_admin}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {GROUPS.map((group) => (
                    <GroupRows key={group.title} group={group} cfg={cfg} onToggle={toggleCap} />
                  ))}
                  <tr className="bg-gray-50/60">
                    <td
                      colSpan={CONFIGURABLE_ROLES.length + 2}
                      className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500"
                    >
                      {CATEGORIES_GROUP_TITLE} · role defaults (per-user overrides win)
                    </td>
                  </tr>
                  {TOOL_CATEGORIES.map((category) => (
                    <tr key={category}>
                      <td className="px-4 py-2 text-gray-700">
                        {TOOL_CATEGORY_LABELS[category]}
                      </td>
                      {CONFIGURABLE_ROLES.map((role) => (
                        <td key={role} className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-indigo-600"
                            checked={cfg.categories[role].includes(category)}
                            onChange={() => toggleCat(role, category)}
                          />
                        </td>
                      ))}
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-gray-300"
                          checked
                          disabled
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DesktopTable>
          </Card>
        </>
      )}
    </div>
  );
}

function GroupRows({
  group,
  cfg,
  onToggle,
}: {
  group: CapGroup;
  cfg: PermissionConfig;
  onToggle: (role: ConfigurableRole, cap: Capability) => void;
}) {
  return (
    <>
      <tr className="bg-gray-50/60">
        <td
          colSpan={CONFIGURABLE_ROLES.length + 2}
          className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500"
        >
          {group.title}
        </td>
      </tr>
      {group.caps.length === 0 && (
        <tr>
          <td colSpan={CONFIGURABLE_ROLES.length + 2} className="px-4 py-2 text-sm text-gray-400">
            {group.emptyNote}
          </td>
        </tr>
      )}
      {group.caps.map((cap) => (
        <tr key={cap}>
          <td className="px-4 py-2 text-gray-700">{CAPABILITY_LABELS[cap]}</td>
          {CONFIGURABLE_ROLES.map((role) => (
            <td key={role} className="px-4 py-2 text-center">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={cfg.capabilities[role].includes(cap)}
                onChange={() => onToggle(role, cap)}
              />
            </td>
          ))}
          <td className="px-4 py-2 text-center">
            <input type="checkbox" className="h-4 w-4 accent-gray-300" checked disabled />
          </td>
        </tr>
      ))}
    </>
  );
}
