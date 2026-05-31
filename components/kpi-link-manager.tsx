"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Lock, Search, TriangleAlert, X } from "lucide-react";
import { Badge, Card, Input, Select } from "@/components/ui";
import { SortTh, useTableSort } from "@/components/table-controls";
import { useToast } from "@/components/toast";
import { isLinkableTier } from "@/lib/allowance/tier-rules";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";
import { cn } from "@/lib/utils";

export interface LinkCoach {
  id: number;
  canonicalName: string;
  aliases: string[];
  center: string;
  tier: AllowanceTier | null;
  active: boolean;
  kpiLinkNa: boolean;
  kpiLinkNaTier: AllowanceTier | null;
}

type Filter = "all" | "linkable" | "na" | "locked" | "recheck";

/**
 * Whether a coach previously marked "not applicable" should be re-surfaced:
 * they were NA'd while on a non-teaching tier but have since moved up to a
 * teaching tier, so the NA may no longer hold.
 */
export function needsRecheck(c: LinkCoach): boolean {
  return (
    c.kpiLinkNa &&
    isLinkableTier(c.tier) &&
    (c.kpiLinkNaTier == null || !isLinkableTier(c.kpiLinkNaTier)) &&
    c.tier !== c.kpiLinkNaTier
  );
}

/** Sort rank for the "KPI link" column: Linkable, then Not applicable, then Locked. */
function kpiLinkRank(c: LinkCoach): number {
  if (!isLinkableTier(c.tier)) return 2; // locked
  if (c.kpiLinkNa) return 1; // not applicable
  return 0; // linkable
}

/** Tier sort uses the real tier order (A1…I3), not alphabetical (so I1 < T0 stays sane). */
function tierRank(c: LinkCoach): number {
  if (!c.tier) return ALLOWANCE_TIERS.length; // unknown tier sorts last
  return ALLOWANCE_TIERS.indexOf(c.tier);
}

export function KpiLinkManager({
  coaches: initial,
  canEdit,
}: {
  coaches: LinkCoach[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [coaches, setCoaches] = useState(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<number | null>(null);
  /** Coach whose Accounts cell is in edit mode (null = none). */
  const [editingId, setEditingId] = useState<number | null>(null);

  const counts = useMemo(() => {
    let linkable = 0;
    let na = 0;
    let locked = 0;
    let recheck = 0;
    for (const c of coaches) {
      if (!isLinkableTier(c.tier)) locked++;
      else if (c.kpiLinkNa) na++;
      else linkable++;
      if (needsRecheck(c)) recheck++;
    }
    return { linkable, na, locked, recheck };
  }, [coaches]);

  const visible = useMemo(() => {
    return coaches.filter((c) => {
      if (q && !`${c.canonicalName} ${c.center} ${c.aliases.join(" ")}`.toLowerCase().includes(q.toLowerCase())) {
        return false;
      }
      const locked = !isLinkableTier(c.tier);
      switch (filter) {
        case "linkable":
          return !locked && !c.kpiLinkNa;
        case "na":
          return c.kpiLinkNa;
        case "locked":
          return locked;
        case "recheck":
          return needsRecheck(c);
        default:
          return true;
      }
    });
  }, [coaches, q, filter]);

  // Click any header to sort (asc → desc → off). Default A–Z by coach name.
  const { sorted, sort, toggleSort } = useTableSort(
    visible,
    {
      coach: (c) => c.canonicalName,
      tier: (c) => tierRank(c),
      link: (c) => kpiLinkRank(c),
    },
    { key: "coach", dir: "asc" },
  );

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/kpi/links/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Update failed");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
      throw e;
    } finally {
      setBusy(null);
    }
  }

  async function toggleNa(c: LinkCoach, na: boolean) {
    // Optimistic local update so the badge flips immediately.
    setCoaches((prev) =>
      prev.map((x) =>
        x.id === c.id ? { ...x, kpiLinkNa: na, kpiLinkNaTier: na ? c.tier : null } : x,
      ),
    );
    try {
      await patch(c.id, { kpiLinkNa: na, naTier: c.tier });
      toast.success(na ? `${c.canonicalName} won’t be KPI-linked.` : `${c.canonicalName} re-enabled.`);
    } catch {
      setCoaches(initial); // revert on failure
    }
  }

  /**
   * Persist a coach's account aliases. Aliases are the CSV account names that
   * merge into this coach (lib/kpi/merge.ts), so adding one here is how you
   * manually link an allowance whose CSV account didn't auto-match — next
   * month's upload recognises that account and the allowance links into KPI.
   */
  async function saveAliases(c: LinkCoach, aliases: string[]) {
    const cleaned = [...new Set(aliases.map((a) => a.trim()).filter(Boolean))].sort();
    const prev = coaches;
    setCoaches((cs) => cs.map((x) => (x.id === c.id ? { ...x, aliases: cleaned } : x)));
    setEditingId(null);
    try {
      await patch(c.id, { aliases: cleaned });
      toast.success(`Accounts updated for ${c.canonicalName}.`);
    } catch {
      setCoaches(prev); // revert on failure
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center gap-2">
        <Link2 className="h-5 w-5 text-indigo-500" />
        <h1 className="text-lg font-bold text-gray-900">KPI ↔ Allowance links</h1>
      </div>
      <p className="mb-3 text-sm text-gray-500">
        Controls which coaches&apos; teaching allowance links into the KPI leaderboard. Tiers that
        don&apos;t teach (A1–A3, PA, T0) are locked and can never link. Mark anyone else
        &ldquo;Not applicable&rdquo; to skip them; it&apos;s remembered until they move up to a
        teaching tier.
      </p>

      {counts.recheck > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{counts.recheck}</strong> coach(es) marked “not applicable” have since moved to a
            teaching tier. Re-check whether they should link now.
          </span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name / center / alias…"
            className="w-56 py-1.5 pl-7 text-xs"
          />
        </div>
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="w-auto py-1.5 text-xs"
        >
          <option value="all">All ({coaches.length})</option>
          <option value="linkable">Linkable ({counts.linkable})</option>
          <option value="na">Not applicable ({counts.na})</option>
          <option value="locked">Locked tier ({counts.locked})</option>
          <option value="recheck">Needs re-check ({counts.recheck})</option>
        </Select>
        <span className="ml-auto text-xs text-gray-500">
          {visible.length} of {coaches.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <SortTh label="Coach" sortKey="coach" sort={sort} onSort={toggleSort} className="px-3" />
              <SortTh label="Tier" sortKey="tier" sort={sort} onSort={toggleSort} className="px-3" />
              <th className="px-3 py-2 text-left">Accounts (aliases)</th>
              <SortTh label="KPI link" sortKey="link" sort={sort} onSort={toggleSort} align="center" className="px-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">
                  No coaches match.
                </td>
              </tr>
            ) : (
              sorted.map((c) => {
                const locked = !isLinkableTier(c.tier);
                const recheck = needsRecheck(c);
                return (
                  <tr key={c.id} className={cn(recheck && "bg-amber-50/60")}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{c.canonicalName}</div>
                      <div className="text-[11px] text-gray-400">
                        {c.center || "—"}
                        {!c.active && <span className="ml-1 text-gray-400">· inactive</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-medium text-gray-700">{c.tier ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2">
                      {editingId === c.id ? (
                        <AliasEditor
                          initial={c.aliases}
                          busy={busy === c.id}
                          onCancel={() => setEditingId(null)}
                          onSave={(next) => saveAliases(c, next)}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <div
                            className="max-w-md truncate text-[11px] text-gray-500"
                            title={c.aliases.join(", ")}
                          >
                            {c.aliases.length ? (
                              c.aliases.join(", ")
                            ) : (
                              <span className="text-gray-300">none</span>
                            )}
                          </div>
                          {canEdit && (
                            <button
                              type="button"
                              className="shrink-0 text-[11px] font-medium text-indigo-600 hover:underline"
                              onClick={() => setEditingId(c.id)}
                            >
                              {c.aliases.length ? "edit" : "+ add"}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {locked ? (
                        <Badge className="bg-gray-100 text-gray-500">
                          <Lock className="mr-1 inline h-3 w-3" /> Locked
                        </Badge>
                      ) : c.kpiLinkNa ? (
                        <div className="flex items-center justify-center gap-2">
                          <Badge className="bg-amber-100 text-amber-700">Not applicable</Badge>
                          {canEdit && (
                            <button
                              className="text-[11px] font-medium text-indigo-600 hover:underline disabled:opacity-50"
                              disabled={busy === c.id}
                              onClick={() => toggleNa(c, false)}
                            >
                              enable
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <Badge className="bg-green-100 text-green-700">Linkable</Badge>
                          {canEdit && (
                            <button
                              className="text-[11px] font-medium text-gray-500 hover:text-amber-700 hover:underline disabled:opacity-50"
                              disabled={busy === c.id}
                              onClick={() => toggleNa(c, true)}
                            >
                              mark N/A
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!canEdit && (
        <p className="mt-3 text-xs text-gray-500">You have read-only access to these links.</p>
      )}
    </Card>
  );
}

/**
 * Inline editor for a coach's account aliases (the CSV account names that merge
 * into them). Add the exact account name as it appears in the KPI CSV so next
 * month's upload links it — and its allowance — to this coach.
 */
function AliasEditor({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: string[];
  busy: boolean;
  onSave: (aliases: string[]) => void;
  onCancel: () => void;
}) {
  const [list, setList] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    // Case-insensitive de-dupe so the same account isn't added twice.
    if (!list.some((a) => a.toLowerCase() === v.toLowerCase())) setList((l) => [...l, v]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {list.map((a) => (
          <span
            key={a}
            className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700"
          >
            {a}
            <button
              type="button"
              className="text-gray-400 hover:text-red-600"
              onClick={() => setList((l) => l.filter((x) => x !== a))}
              aria-label={`Remove ${a}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {list.length === 0 && <span className="text-[11px] text-gray-300">no accounts</span>}
      </div>
      <div className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add CSV account name…"
          className="w-48 py-1 text-[11px]"
        />
        <button
          type="button"
          className="rounded border border-gray-200 px-1.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
          onClick={add}
        >
          Add
        </button>
        <button
          type="button"
          className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          disabled={busy}
          onClick={() => onSave(list)}
        >
          Save
        </button>
        <button
          type="button"
          className="px-1.5 py-1 text-[11px] font-medium text-gray-500 hover:underline"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Keep the tier list importable for any future tier editor on this page.
export { ALLOWANCE_TIERS };
