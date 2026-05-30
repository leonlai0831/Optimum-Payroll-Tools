import Anthropic from "@anthropic-ai/sdk";
import type { BreakdownItem } from "@/lib/kpi/types";
import { logger } from "@/lib/log";

// Model chosen in the approved plan for these lightweight tasks.
const MODEL = "claude-sonnet-4-6";

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export interface AccountForMatch {
  name: string;
  center: string;
  students: number;
}

const MATCH_SYSTEM = `You are a data analyst for a swim school. You are given a list of instructor "account" names from a monthly report. Multiple account names sometimes refer to the SAME real coach — e.g. branch suffixes like "[BK]"/"[HQ]", a "HARVEST" or numbered variant, or a slightly different spelling of the same person.

Your job: group the account names that refer to the same real person.

Rules:
- Only group names you are confident are the same person. This drives payroll, so a wrong merge is costly — when unsure, keep them separate.
- A group must contain 2 or more account names. Do NOT return singletons.
- Use the names, center, and student counts as hints, but the name is the strongest signal.
- Return every account name at most once.`;

const MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    clusters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          accounts: { type: "array", items: { type: "string" } },
        },
        required: ["accounts"],
      },
    },
  },
  required: ["clusters"],
} as const;

/**
 * Use Claude to find additional same-person clusters beyond the deterministic
 * clean-name grouping. Returns groups of original account names. No-ops to an
 * empty array when ANTHROPIC_API_KEY is unset or on any error (the deterministic
 * merge still applies).
 */
export async function matchInstructorNames(
  accounts: AccountForMatch[],
): Promise<string[][]> {
  const client = getClient();
  if (!client || accounts.length === 0) return [];

  const list = accounts
    .map((a) => `- ${a.name} (center: ${a.center}, students: ${a.students})`)
    .join("\n");

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: "text", text: MATCH_SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { format: { type: "json_schema", schema: MATCH_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Account names:\n${list}\n\nReturn the groups of account names that are the same person.`,
        },
      ],
    });

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return [];
    const parsed = JSON.parse(text.text) as { clusters?: { accounts: string[] }[] };
    return (parsed.clusters ?? [])
      .map((c) => c.accounts.filter((n) => typeof n === "string"))
      .filter((g) => g.length >= 2);
  } catch (err) {
    logger.warn("matchInstructorNames failed; using deterministic merge only", { err });
    return [];
  }
}

export interface AnalyzeInput {
  name: string;
  finalScore: number;
  grade: string;
  position: string;
  breakdown: Pick<BreakdownItem, "name" | "score" | "displayValue">[];
}

const ANALYZE_SYSTEM = `You are a performance coach for a swim school. Given a coach's KPI breakdown and final score, write a concise insight (2–4 sentences) for management. Mention the single strongest metric and the weakest one by name, and give one concrete, actionable suggestion. Be direct and specific; no preamble, no bullet lists.`;

/** Template fallback used when the API key is missing or a call fails. */
function fallbackAnalysis(input: AnalyzeInput): string {
  const sorted = [...input.breakdown].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  let sentiment = "Solid performance.";
  if (input.finalScore > 1.1) sentiment = "Outstanding results, exceeding expectations.";
  else if (input.finalScore < 0.9) sentiment = "Below target — key areas need attention.";
  if (!top || !bottom) return `${input.name}: ${sentiment} (Score ${input.finalScore.toFixed(2)}).`;
  return `${input.name}: ${sentiment} (Score ${input.finalScore.toFixed(2)}, grade ${input.grade}). Strongest area is ${top.name} (${top.score.toFixed(2)}); focus improvement on ${bottom.name} (${bottom.score.toFixed(2)}).`;
}

/** Generate a short coaching insight via Claude, falling back to a template. */
export async function analyzePerformance(input: AnalyzeInput): Promise<string> {
  const client = getClient();
  if (!client) return fallbackAnalysis(input);

  const metrics = input.breakdown
    .map((b) => `- ${b.name}: value ${b.displayValue}, score ${b.score.toFixed(2)}`)
    .join("\n");

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [{ type: "text", text: ANALYZE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `Coach: ${input.name}\nPosition: ${input.position}\nFinal score: ${input.finalScore.toFixed(2)} (grade ${input.grade})\nMetrics:\n${metrics}`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : fallbackAnalysis(input);
  } catch (err) {
    logger.warn("analyzePerformance failed; using template fallback", { err });
    return fallbackAnalysis(input);
  }
}
