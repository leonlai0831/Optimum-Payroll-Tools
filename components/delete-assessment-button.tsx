"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { ConfirmModal } from "@/components/modal";

export function DeleteAssessmentButton({ id }: { id: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/assessments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Assessment deleted.");
      router.refresh();
    } catch {
      toast.error("Delete failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={busy}
        className="text-gray-300 transition hover:text-red-500 disabled:opacity-40"
        title="Delete assessment"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={remove}
        title="Delete assessment?"
        message="This cannot be undone. The instructor's KPI management score will fall back to their previous assessment."
        confirmLabel="Delete"
        busy={busy}
      />
    </>
  );
}
