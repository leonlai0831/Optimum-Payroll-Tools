import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createNote } from "@/lib/db/queries";
import {
  NOTE_SEVERITIES,
  NOTE_TYPES,
  type NoteSeverity,
  type NoteType,
} from "@/lib/performance/types";

export async function POST(req: Request, ctx: RouteContext<"/api/staff/[id]/notes">) {
  const denied = await requireCapability("edit_notes");
  if (denied) return denied;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const coachId = Number(id);
  const body = (await req.json().catch(() => ({}))) as {
    type?: string;
    noteDate?: string;
    title?: string;
    body?: string;
    severity?: string;
    followUp?: boolean;
  };

  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  const type: NoteType = (NOTE_TYPES as readonly string[]).includes(body.type ?? "")
    ? (body.type as NoteType)
    : "general";
  const severity: NoteSeverity | null =
    type === "disciplinary" && (NOTE_SEVERITIES as readonly string[]).includes(body.severity ?? "")
      ? (body.severity as NoteSeverity)
      : null;
  const parsedDate = body.noteDate ? new Date(body.noteDate) : new Date();

  await createNote({
    coachId,
    noteDate: Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
    type,
    title,
    body: String(body.body ?? "").trim(),
    severity,
    followUp: !!body.followUp,
    authoredBy: actor.email,
  });
  return NextResponse.json({ ok: true });
}
