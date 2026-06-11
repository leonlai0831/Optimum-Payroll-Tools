import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import {
  getFreelancerConfigFresh,
  listFreelancerRuns,
  recordAudit,
  upsertFreelancerRun,
} from "@/lib/db/queries";
import { calcFreelancer } from "@/lib/freelancer/calc";
import { isValidPeriod } from "@/lib/allowance/period";
import {
  FREELANCER_POSITIONS,
  type FreelancerInput,
  type FreelancerPosition,
} from "@/lib/freelancer/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Saved freelancer runs are staff pay records — gate on the module capability.
  const denied = await requireCapability("run_freelancer");
  if (denied) return denied;
  const period = new URL(req.url).searchParams.get("period") ?? undefined;
  return NextResponse.json(await listFreelancerRuns(period));
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Coerce an untrusted body into a well-formed FreelancerInput (or null). */
function sanitizeInput(raw: unknown): FreelancerInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name);
  if (!name) return null;
  if (!(FREELANCER_POSITIONS as readonly string[]).includes(r.position as string)) return null;
  return {
    coachId: typeof r.coachId === "number" && Number.isFinite(r.coachId) ? r.coachId : null,
    name,
    position: r.position as FreelancerPosition,
    icNo: str(r.icNo),
    bankName: str(r.bankName),
    bankAccount: str(r.bankAccount),
    centerRows: (Array.isArray(r.centerRows) ? r.centerRows : [])
      .map((row) => {
        const c = (row ?? {}) as Record<string, unknown>;
        return {
          center: str(c.center),
          replacedHours: Math.max(0, num(c.replacedHours)),
          fixedHours: Math.max(0, num(c.fixedHours)),
          absent: c.absent === true,
        };
      })
      .filter((row) => row.center !== ""),
    blackCount: Math.max(0, num(r.blackCount)),
    kpiName:
      typeof r.kpiName === "string" && r.kpiName.trim() ? r.kpiName.trim().slice(0, 120) : null,
    colourCount: Math.max(0, num(r.colourCount)),
    extras: (Array.isArray(r.extras) ? r.extras : [])
      .map((row) => {
        const e = (row ?? {}) as Record<string, unknown>;
        return { entity: str(e.entity), reason: str(e.reason), amount: num(e.amount) };
      })
      .filter((e) => e.entity !== ""),
  };
}

export async function POST(req: Request) {
  const denied = await requireCapability("run_freelancer");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) as {
    periodLabel?: string;
    input?: unknown;
  };
  if (!body.periodLabel || !isValidPeriod(body.periodLabel)) {
    return NextResponse.json({ error: "periodLabel must be a valid YYYY-MM month" }, { status: 400 });
  }
  const input = sanitizeInput(body.input);
  if (!input) {
    return NextResponse.json({ error: "a freelancer name and valid position are required" }, { status: 400 });
  }
  // Recompute server-side from the live config (ignore any client-sent result),
  // and snapshot that config so the saved record stays reproducible. Read FRESH
  // (cache-bypassing) so a multi-instance deploy never snapshots stale rates.
  const configSnapshot = await getFreelancerConfigFresh();
  const result = calcFreelancer(input, configSnapshot);
  const id = await upsertFreelancerRun({
    periodLabel: body.periodLabel,
    input,
    result,
    configSnapshot,
  });
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "freelancer.save",
      entity: "freelancer_run",
      entityId: id,
      summary: `Saved freelancer payment for ${input.name} (${body.periodLabel})`,
    });
  }
  return NextResponse.json({ ok: true, id });
}
