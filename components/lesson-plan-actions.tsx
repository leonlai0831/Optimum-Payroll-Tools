"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileDown, MessageSquareWarning, Pencil, Send, Trash2 } from "lucide-react";
import { Button, Spinner, Textarea } from "@/components/ui";
import { ConfirmModal, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import type { LessonPlanStatus } from "@/lib/lesson-plan/types";

/**
 * The action bar on a lesson-plan detail page. Owner: Edit (any status — the
 * edit resets it to draft), Submit (draft / changes-requested), Delete (draft).
 * Reviewer: Approve / Request changes while the plan is submitted. Everyone
 * with access can download the PDF.
 */
export function LessonPlanActions({
  id,
  status,
  isOwner,
  canReview,
}: {
  id: number;
  status: LessonPlanStatus;
  isOwner: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [note, setNote] = useState("");

  async function call(
    path: string,
    init: RequestInit,
    success: string,
    after?: () => void,
  ) {
    setBusy(true);
    try {
      const res = await fetch(path, init);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Request failed");
      }
      toast.success(success);
      after?.();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const submit = () =>
    call(
      `/api/lesson-plans/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      },
      "Plan submitted for review.",
    );

  const review = (action: "approve" | "request_changes") =>
    call(
      `/api/lesson-plans/${id}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() }),
      },
      action === "approve" ? "Plan approved." : "Changes requested.",
      () => {
        setChangesOpen(false);
        setNote("");
      },
    );

  const remove = () =>
    call(`/api/lesson-plans/${id}`, { method: "DELETE" }, "Plan deleted.", () => {
      setConfirmDelete(false);
      router.push("/lesson-plans/history");
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/lesson-plans/${id}/pdf`} download>
        <Button variant="outline" disabled={busy}>
          <FileDown className="h-4 w-4" /> PDF
        </Button>
      </a>
      {isOwner && (
        <>
          <Link href={`/lesson-plans/${id}/edit`}>
            <Button variant="outline" disabled={busy}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </Link>
          {(status === "draft" || status === "changes_requested") && (
            <Button onClick={submit} disabled={busy}>
              {busy ? <Spinner /> : <Send className="h-4 w-4" />} Submit for review
            </Button>
          )}
          {status === "draft" && (
            <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </>
      )}
      {canReview && status === "submitted" && (
        <>
          <Button onClick={() => review("approve")} disabled={busy}>
            {busy ? <Spinner /> : <Check className="h-4 w-4" />} Approve
          </Button>
          <Button variant="secondary" onClick={() => setChangesOpen(true)} disabled={busy}>
            <MessageSquareWarning className="h-4 w-4" /> Request changes
          </Button>
        </>
      )}

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete this lesson plan?"
        message="This permanently removes the draft. This cannot be undone."
        confirmLabel="Delete plan"
        busy={busy}
      />

      <Modal
        open={changesOpen}
        onClose={() => (busy ? undefined : setChangesOpen(false))}
        title="Request changes"
        footer={
          <>
            <Button variant="outline" onClick={() => setChangesOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => review("request_changes")} disabled={busy || !note.trim()}>
              {busy ? <Spinner /> : <Send className="h-4 w-4" />} Send back
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Tell the instructor what to change — the note stays visible on the plan.
        </p>
        <Textarea
          className="mt-2"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What needs to change?"
          aria-label="Review note"
        />
      </Modal>
    </div>
  );
}
