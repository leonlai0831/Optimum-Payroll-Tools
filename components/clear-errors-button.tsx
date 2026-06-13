"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { ConfirmModal } from "@/components/modal";

/** "Clear all" on /system/errors — confirms, DELETEs, refreshes the list. */
export function ClearErrorsButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const clear = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/errors", { method: "DELETE" });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Clear all
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void clear()}
        title="Clear captured errors?"
        message="This wipes the whole error list. The deletion itself is recorded in the audit log."
        confirmLabel="Clear all"
        busy={busy}
      />
    </>
  );
}
