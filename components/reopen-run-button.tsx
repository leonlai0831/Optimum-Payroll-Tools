"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockOpen } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { ConfirmModal } from "@/components/modal";
import { useToast } from "@/components/toast";

/**
 * Reopen a finalized KPI month for correction — the mirror of unlocking a Saved
 * Allowances month. Flips the run back to an editable draft (PATCH `{ reopen }`),
 * behind the same `finalize_kpi` gate as finalizing, so a manager who spotted a
 * mistake after closing the month can fix it. Confirms first.
 */
export function ReopenRunButton({ id, period }: { id: number; period: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function apply() {
    setConfirm(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/runs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reopen: true }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to reopen");
      }
      toast.success(`${period} reopened for edits.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reopen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirm(true)}
        disabled={busy}
        title="Reopen this month so the management review can be edited again"
      >
        {busy ? <Spinner /> : <LockOpen className="h-3.5 w-3.5" />} Reopen
      </Button>
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={apply}
        title={`Reopen ${period}?`}
        message="This sends the month back to draft so the management review can be edited. The bonus stays as-is until it's finalized again."
        confirmLabel="Reopen month"
        busy={busy}
      />
    </>
  );
}
