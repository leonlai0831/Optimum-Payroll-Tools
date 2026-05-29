"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, MessageSquare, Plus, Save, Trash2, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner, Textarea } from "@/components/ui";
import { ConfirmModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import {
  NOTE_SEVERITIES,
  NOTE_SEVERITY_LABELS,
  NOTE_TYPES,
  NOTE_TYPE_LABELS,
  type NoteSeverity,
  type NoteType,
} from "@/lib/performance/types";
import { cn } from "@/lib/utils";

export interface NoteView {
  id: number;
  noteDate: string;
  type: NoteType;
  title: string;
  body: string;
  severity: NoteSeverity | null;
  followUp: boolean;
  authoredBy: string;
}

const TYPE_STYLES: Record<NoteType, string> = {
  recognition: "bg-green-50 text-green-700",
  disciplinary: "bg-red-50 text-red-700",
  coaching: "bg-blue-50 text-blue-700",
  general: "bg-gray-100 text-gray-600",
};

export function NotesTimeline({
  coachId,
  notes,
  canEdit,
}: {
  coachId: number;
  notes: NoteView[];
  canEdit: boolean;
}) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-h3 text-gray-900">
        <MessageSquare className="h-4 w-4" /> Notes
      </h3>

      {canEdit && <AddNote coachId={coachId} />}

      {notes.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">No notes yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} canEdit={canEdit} />
          ))}
        </div>
      )}
    </Card>
  );
}

function AddNote({ coachId }: { coachId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<NoteType>("general");
  const [noteDate, setNoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<NoteSeverity>("low");
  const [followUp, setFollowUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setType("general");
    setNoteDate(new Date().toISOString().slice(0, 10));
    setTitle("");
    setBody("");
    setSeverity("low");
    setFollowUp(false);
    setError("");
  }

  async function submit() {
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/staff/${coachId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          noteDate,
          title,
          body,
          severity: type === "disciplinary" ? severity : null,
          followUp,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Save failed");
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add note
      </Button>
    );
  }

  return (
    <Card className="border-indigo-100 bg-indigo-50/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-900">New note</span>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-gray-400 hover:text-gray-600"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="n-type">Type</Label>
          <Select
            id="n-type"
            className="mt-1"
            value={type}
            onChange={(e) => setType(e.target.value as NoteType)}
          >
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {NOTE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="n-date">Date</Label>
          <Input
            id="n-date"
            type="date"
            className="mt-1"
            value={noteDate}
            onChange={(e) => setNoteDate(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3">
        <Label htmlFor="n-title">Title</Label>
        <Input
          id="n-title"
          className="mt-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary"
        />
      </div>
      <div className="mt-3">
        <Label htmlFor="n-body">Details</Label>
        <Textarea
          id="n-body"
          className="mt-1"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Optional details"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        {type === "disciplinary" && (
          <div>
            <Label htmlFor="n-sev">Severity</Label>
            <Select
              id="n-sev"
              className="mt-1 w-32"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as NoteSeverity)}
            >
              {NOTE_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {NOTE_SEVERITY_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-600"
            checked={followUp}
            onChange={(e) => setFollowUp(e.target.checked)}
          />
          Needs follow-up
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3">
        <Button onClick={submit} disabled={busy}>
          {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save note
        </Button>
      </div>
    </Card>
  );
}

function NoteCard({ note, canEdit }: { note: NoteView; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function remove() {
    setConfirmDelete(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/notes/${note.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast.error("Delete failed.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                TYPE_STYLES[note.type],
              )}
            >
              {NOTE_TYPE_LABELS[note.type]}
            </span>
            {note.severity && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                {NOTE_SEVERITY_LABELS[note.severity]}
              </span>
            )}
            {note.followUp && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                <Flag className="h-3 w-3" /> Follow-up
              </span>
            )}
            <span className="font-semibold text-gray-900">{note.title}</span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {new Date(note.noteDate).toLocaleDateString()}
            {note.authoredBy ? ` · by ${note.authoredBy}` : ""}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="text-gray-300 transition hover:text-red-500 disabled:opacity-40"
            title="Delete note"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {note.body && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{note.body}</p>}
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete this note?"
        message="This cannot be undone."
        confirmLabel="Delete note"
        busy={busy}
      />
    </div>
  );
}
