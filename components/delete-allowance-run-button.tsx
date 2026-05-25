"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, Spinner } from "@/components/ui";

export function DeleteAllowanceRunButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Delete this saved allowance? This cannot be undone.")) return;
    setBusy(true);
    await fetch(`/api/allowance/runs/${id}`, { method: "DELETE" });
    router.push("/allowance/history");
    router.refresh();
  }

  return (
    <Button variant="danger" onClick={remove} disabled={busy}>
      {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Delete
    </Button>
  );
}
