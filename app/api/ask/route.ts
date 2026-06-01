import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getTrendData } from "@/lib/db/queries";
import { answerDataQuestion } from "@/lib/ai/anthropic";

/**
 * POST { question } -> an AI answer grounded in the saved KPI data. We build a
 * compact text summary of the runs (months × coaches × score/payout) and let
 * Claude reason over THAT — it never constructs a DB query, so it can't run a
 * wrong or expensive one.
 */
export async function POST(req: Request) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { question?: string };
  const question = (body.question ?? "").trim();
  if (!question) return NextResponse.json({ text: "Ask a question about the saved KPI data." });

  // Compact, deterministic summary: one line per coach per month they appear.
  const trend = await getTrendData();
  const lines: string[] = [];
  for (const coach of trend.coaches) {
    for (const p of coach.points) {
      lines.push(
        `${p.period} | ${coach.name} | score ${p.score.toFixed(2)} | payout RM${p.payout.toFixed(2)}`,
      );
    }
  }
  const dataSummary = lines.length
    ? `Periods: ${trend.periods.join(", ")}\n\n${lines.join("\n")}`
    : "No saved KPI runs yet.";

  const text = await answerDataQuestion({ question, dataSummary });
  return NextResponse.json({ text });
}
