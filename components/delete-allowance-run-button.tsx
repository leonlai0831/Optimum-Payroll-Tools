"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { ConfirmModal } from "@/components/modal";
import { useToast } from "@/components/toast";

export function DeleteAllowanceRunButton({ id }: { id: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/allowance/runs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Delete failed");
      }
      toast.success("Allowance record deleted.");
      router.push("/allowance/history");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)} disabled={busy}>
        {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Delete
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={remove}
        title="Delete this saved allowance?"
        message="This cannot be undone. The staff profile and other allowance records are kept."
        confirmLabel="Delete"
        busy={busy}
      />
    </>
  );
}
