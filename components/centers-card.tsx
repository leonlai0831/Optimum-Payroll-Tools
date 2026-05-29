"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Save, Trash2 } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";

export function CentersCard({ initial, canEdit = true }: { initial: string[]; canEdit?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [centers, setCenters] = useState<string[]>(() => [...initial]);
  const [busy, setBusy] = useState(false);

  function patch(i: number, val: string) {
    setCenters((c) => c.map((x, idx) => (idx === i ? val : x)));
  }
  function add() {
    setCenters((c) => [...c, ""]);
  }
  function remove(i: number) {
    setCenters((c) => c.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    try {
      const payload = [...new Set(centers.map((c) => c.trim()).filter(Boolean))];
      const res = await fetch("/api/allowance/centers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centers: payload }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Save failed");
      }
      setCenters(payload);
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
            Directory. Removing a center here won&apos;t change records that already use it.
          </p>
          <div className="flex flex-wrap gap-2">
            {centers.map((c, i) => (
              <div key={i} className="flex items-center gap-1">
                <Input
                  className="w-24 py-1 text-xs uppercase"
                  value={c}
                  placeholder="Code"
                  onChange={(e) => patch(i, e.target.value)}
                />
                <button
                  className="text-gray-300 transition hover:text-red-500"
                  onClick={() => remove(i)}
                  title="Remove center"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
