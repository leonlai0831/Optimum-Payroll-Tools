"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Save, Trash2, X } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";

/** One editable center row: a code plus the raw names that normalize to it. */
interface CenterRow {
  code: string;
  aliases: string[];
}

function toRows(centers: string[], centerAliases: Record<string, string[]>): CenterRow[] {
  return centers.map((code) => ({ code, aliases: [...(centerAliases[code] ?? [])] }));
}

export function CentersCard({
  initial,
  initialAliases = {},
  canEdit = true,
}: {
  initial: string[];
  /** center code -> alias names (raw CSV labels that normalize to the code). */
  initialAliases?: Record<string, string[]>;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<CenterRow[]>(() => toRows(initial, initialAliases));
  // Per-row draft text for the "add alias" inputs (comma-separated entry).
  const [aliasDraft, setAliasDraft] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  function patchCode(i: number, val: string) {
    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, code: val } : x)));
  }
  function add() {
    setRows((r) => [...r, { code: "", aliases: [] }]);
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
    setAliasDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => Number(k) !== i)));
  }
  function addAliases(i: number) {
    const draft = aliasDraft[i] ?? "";
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) {
      setRows((r) =>
        r.map((x, idx) =>
          idx === i ? { ...x, aliases: [...new Set([...x.aliases, ...parts])] } : x,
        ),
      );
    }
    setAliasDraft((d) => ({ ...d, [i]: "" }));
  }
  function removeAlias(i: number, alias: string) {
    setRows((r) =>
      r.map((x, idx) => (idx === i ? { ...x, aliases: x.aliases.filter((a) => a !== alias) } : x)),
    );
  }

  async function save() {
    setBusy(true);
    try {
      // Trim/dedupe codes; keep the alias map only for codes that survive.
      const seen = new Set<string>();
      const centers: string[] = [];
      const centerAliases: Record<string, string[]> = {};
      for (const row of rows) {
        const code = row.code.trim();
        if (!code || seen.has(code)) continue;
        seen.add(code);
        centers.push(code);
        const cleaned = [...new Set(row.aliases.map((a) => a.trim()).filter(Boolean))];
        if (cleaned.length) centerAliases[code] = cleaned;
      }
      const res = await fetch("/api/allowance/centers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centers, centerAliases }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Save failed");
      }
      setRows(toRows(centers, centerAliases));
      setAliasDraft({});
      toast.success("Centers saved.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Building2 className="h-5 w-5 text-indigo-500" /> Centers
        </h2>
        {canEdit ? (
          <Button onClick={save} disabled={busy}>
            {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save centers
          </Button>
        ) : (
          <span className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">
            Read-only
          </span>
        )}
      </div>

      <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
        <Card className="p-4">
          <p className="mb-3 text-[11px] text-gray-400">
            Options shown in the center dropdowns on the Allowance Calculator and the Staff
            Directory. Add <strong>aliases</strong> for the raw names that appear in uploaded KPI
            CSVs (e.g. <em>Subang USJ</em> → <strong>USJ</strong>) so KPI centers normalize to your
            codes. Removing a center here won&apos;t change records that already use it.
          </p>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-lg border border-gray-100 p-2 sm:flex-row sm:items-start"
              >
                <div className="flex items-center gap-1">
                  <Input
                    className="w-24 py-1 text-xs uppercase"
                    value={row.code}
                    placeholder="Code"
                    onChange={(e) => patchCode(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="text-gray-300 transition hover:text-red-500"
                    onClick={() => remove(i)}
                    title="Remove center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.aliases.map((a) => (
                      <span
                        key={a}
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700"
                      >
                        {a}
                        <button
                          type="button"
                          className="text-indigo-400 transition hover:text-red-500"
                          onClick={() => removeAlias(i, a)}
                          title="Remove alias"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {row.aliases.length === 0 && (
                      <span className="text-[11px] text-gray-300">No aliases</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1">
                    <Input
                      className="py-1 text-xs"
                      value={aliasDraft[i] ?? ""}
                      placeholder="Add alias names (comma-separated)…"
                      onChange={(e) => setAliasDraft((d) => ({ ...d, [i]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAliases(i);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 px-2 py-1 text-xs"
                      onClick={() => addAliases(i)}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" className="mt-3 px-3 py-1.5 text-xs" onClick={add}>
            <Plus className="h-3.5 w-3.5" /> Add center
          </Button>
        </Card>
      </fieldset>
    </div>
  );
}
