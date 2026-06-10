"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitMerge } from "lucide-react";
import { Button, Label, Select, Spinner } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";

/**
 * Merge THIS employee (the duplicate, e.g. a profile auto-created from a KPI
 * CSV under a cleaned name like "ARIF") into another profile (the survivor,
 * e.g. "ARIF FARHAN"). Everything moves — aliases, allowance history,
 * assessments, notes, login link — and this profile is deleted; future KPI
 * uploads then resolve to the survivor because this name becomes its alias.
 */
export function MergeEmployeeButton({
  employee,
  others,
  variant = "icon",
}: {
  employee: { id: number; name: string };
  others: { id: number; name: string }[];
  /** "icon" = compact table-row trigger; "button" = full touch-size card button. */
  variant?: "icon" | "button";
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);

  async function merge() {
    const survivorId = Number(targetId);
    if (!survivorId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/coaches/${survivorId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateId: employee.id }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        conflictingPeriods?: string[];
      };
      if (!res.ok) throw new Error(d.error || "Merge failed");
      toast.success(
        d.conflictingPeriods?.length
          ? `Merged. Allowance for ${d.conflictingPeriods.join(", ")} kept the old name (both had a record) — review manually.`
          : "Profiles merged.",
      );
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === "button" ? (
        <Button
          variant="outline"
          className="min-h-11 flex-1"
          onClick={() => setOpen(true)}
          title="Merge into another employee (duplicate profile)"
        >
          <GitMerge className="h-4 w-4" /> Merge
        </Button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center text-gray-400 transition hover:text-indigo-600"
          title="Merge into another employee (duplicate profile)"
        >
          <GitMerge className="h-4 w-4" />
        </button>
      )}
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={`Merge ${employee.name}`}>
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            Use this when <strong>{employee.name}</strong> is a duplicate of another
            employee (e.g. a profile auto-created from a KPI upload). Their aliases,
            allowance history, assessments, notes and login move to the employee you
            pick; KPI history follows automatically. <strong>{employee.name}</strong>{" "}
            is then deleted. This cannot be undone.
          </p>
          <div>
            <Label htmlFor="merge-target">Merge into</Label>
            <Select
              id="merge-target"
              className="mt-1 w-full"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">— select the employee to keep —</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={merge} disabled={busy || !targetId}>
              {busy ? <Spinner /> : <GitMerge className="h-4 w-4" />} Merge & delete{" "}
              {employee.name}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
