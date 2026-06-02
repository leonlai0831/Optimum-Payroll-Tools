"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { Button, Input, Spinner } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { previousPeriod } from "@/lib/allowance/period";

/** Change a single entry's month (per-row "Change month"). Manager-only. */
export function ChangeRunMonthButton({
  id,
  from,
  name,
}: {
  id: number;
  from: string;
  name: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(() => previousPeriod(from));
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!to || to === from) {
      toast.error("Pick a different target month.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/allowance/runs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodLabel: to }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Moved ${name} to ${to}.`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="px-3 py-1.5 text-xs"
        onClick={() => {
          setTo(previousPeriod(from));
          setOpen(true);
        }}
        title={`Move this entry to another month`}
      >
        <ArrowLeftRight className="h-3.5 w-3.5" /> Change month
      </Button>
      <Modal
        open={open}
        onClose={busy ? () => {} : () => setOpen(false)}
        title={`Change month — ${name}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={busy || !to || to === from}>
              {busy && <Spinner />} Move to {to || "…"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Move <span className="font-semibold">{name}</span>&rsquo;s entry from{" "}
            <span className="font-semibold">{from}</span> to the month below. If they already have an
            entry in that month, the move is refused so nothing is overwritten.
          </p>
          <label className="block text-sm font-medium text-gray-700">
            Move to month
            <Input
              type="month"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1"
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
