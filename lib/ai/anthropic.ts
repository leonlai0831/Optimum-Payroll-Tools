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

// ---------------------------------------------------------------------------
// CSV anomaly detection (feature #1): flag suspect rows before they reach payroll.
// ---------------------------------------------------------------------------

/** One row of the uploaded monthly CSV, reduced to the fields the check needs. */
export interface CsvRowForCheck {
  instructor: string;
  center: string;
  students: number;
}

export type AnomalySeverity = "high" | "medium" | "low";

export interface CsvAnomaly {
  /** Account name(s) the issue concerns, joined for display. */
  account: string;
  severity: AnomalySeverity;
  /** Short human-readable explanation of what looks wrong. */
  message: string;
}

const ANOMALY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    anomalies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          account: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          message: { type: "string" },
        },
        required: ["account", "severity", "message"],
      },
    },
  },
  required: ["anomalies"],
} as const;

const ANOMALY_SYSTEM = `You are a data-quality reviewer for a swim school's monthly instructor report, used to calculate payroll. You are given this month's per-account student counts, and optionally last month's, so wrong data must be caught before it pays out.

Flag only genuinely suspicious rows. Look for:
- A large unexplained swing in a coach's student count vs last month (big drop or spike).
- An account that looks like a duplicate of another (same person, slightly different name) and may double-count.
- Missing or zero student counts where a teaching account is expected.
- Counts that are implausible for a single instructor.

Rules:
- Be conservative: only report issues a human should review. An empty list is a valid, good answer.
- severity: "high" = likely wrong/will mispay, "medium" = worth a look, "low" = minor.
- Keep each message to one short sentence naming the account(s) and the concern.`;

/**
 * Ask Claude to flag suspect rows in an uploaded month before they reach the
 * KPI/payout calc. Optional `previous` gives last month's counts for swing
 * detection. No-ops to an empty array without ANTHROPIC_API_KEY or on any error
 * (this is an advisory check; upload still proceeds).
 */
export async function detectCsvAnomalies(
  current: CsvRowForCheck[],
  previous: CsvRowForCheck[] = [],
): Promise<CsvAnomaly[]> {
  const client = getClient();
  if (!client || current.length === 0) return [];

  const fmt = (rows: CsvRowForCheck[]) =>
    rows.map((r) => `- ${r.instructor} (center: ${r.center}, students: ${r.students})`).join("\n");
  const prevBlock = previous.length ? `\n\nLast month:\n${fmt(previous)}` : "";

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [{ type: "text", text: ANOMALY_SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { format: { type: "json_schema", schema: ANOMALY_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `This month:\n${fmt(current)}${prevBlock}\n\nReturn the anomalies a human should review.`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return [];
    const parsed = JSON.parse(text.text) as { anomalies?: CsvAnomaly[] };
    return (parsed.anomalies ?? []).filter(
      (a) => a && typeof a.account === "string" && typeof a.message === "string",
    );
  } catch (err) {
    logger.warn("detectCsvAnomalies failed; skipping anomaly check", { err });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Monthly digest (feature #2): a natural-language summary of a finalized month.
// ---------------------------------------------------------------------------

export interface DigestCoach {
  name: string;
  finalScore: number;
  grade: string;
  payout: number;
}

export interface DigestInput {
  period: string;
  coaches: DigestCoach[];
}

const DIGEST_SYSTEM = `You are an operations analyst for a swim school. Given one month's finalized KPI results for all coaches, write a short management digest (3–5 sentences, plain prose, no bullet lists). Cover: how many coaches, total payout, how many reached the top grade (S), the standout performer, and anyone who clearly needs attention (lowest scores). Be specific with names and numbers; no preamble.`;

/** Build the deterministic digest used when the API key is missing or a call fails. */
function fallbackDigest(input: DigestInput): string {
  const n = input.coaches.length;
  if (n === 0) return `${input.period}: no coaches in this run.`;
  const total = input.coaches.reduce((s, c) => s + (c.payout || 0), 0);
  const sCount = input.coaches.filter((c) => c.grade === "S").length;
  const sorted = [...input.coaches].sort((a, b) => b.finalScore - a.finalScore);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  return (
    `${input.period}: ${n} coach(es), total payout RM${total.toFixed(2)}, ${sCount} at grade S. ` +
    `Top performer ${top.name} (${top.finalScore.toFixed(2)}); lowest ${bottom.name} (${bottom.finalScore.toFixed(2)}).`
  );
}

/** Generate a natural-language monthly digest via Claude, falling back to a template. */
export async function summarizeRun(input: DigestInput): Promise<string> {
  const client = getClient();
  if (!client || input.coaches.length === 0) return fallbackDigest(input);

  const total = input.coaches.reduce((s, c) => s + (c.payout || 0), 0);
  const lines = input.coaches
    .map((c) => `- ${c.name}: score ${c.finalScore.toFixed(2)}, grade ${c.grade}, payout RM${c.payout.toFixed(2)}`)
    .join("\n");

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: [{ type: "text", text: DIGEST_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `Month: ${input.period}\nCoaches: ${input.coaches.length}\nTotal payout: RM${total.toFixed(2)}\n\n${lines}`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : fallbackDigest(input);
  } catch (err) {
    logger.warn("summarizeRun failed; using template fallback", { err });
    return fallbackDigest(input);
  }
}

// ---------------------------------------------------------------------------
// Trend narrative (feature #3): explain a coach's month-over-month trajectory.
// ---------------------------------------------------------------------------

export interface TrendPoint {
  period: string;
  score: number;
  payout: number;
}

export interface TrendInput {
  name: string;
  points: TrendPoint[];
}

const TREND_SYSTEM = `You are a performance analyst for a swim school. Given one coach's KPI final score across several months, write a concise narrative (2–3 sentences) of their trajectory: the overall direction (improving, declining, steady, volatile), the most notable change, and one forward-looking note. Be specific with the months and scores; no preamble, no bullet lists.`;

/** Deterministic trend summary for the no-key / failure fallback. */
function fallbackTrend(input: TrendInput): string {
  const pts = input.points;
  if (pts.length === 0) return `${input.name}: no history yet.`;
  if (pts.length === 1) {
    return `${input.name}: only ${pts[0].period} on record (score ${pts[0].score.toFixed(2)}).`;
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  const delta = last.score - first.score;
  const dir = delta > 0.05 ? "improving" : delta < -0.05 ? "declining" : "steady";
  return (
    `${input.name}: ${dir} over ${pts.length} months, from ${first.score.toFixed(2)} (${first.period}) ` +
    `to ${last.score.toFixed(2)} (${last.period}).`
  );
}

/** Generate a month-over-month trend narrative via Claude, falling back to a template. */
export async function analyzeTrend(input: TrendInput): Promise<string> {
  const client = getClient();
  if (!client || input.points.length < 2) return fallbackTrend(input);

  const series = input.points
    .map((p) => `- ${p.period}: score ${p.score.toFixed(2)}, payout RM${p.payout.toFixed(2)}`)
    .join("\n");

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [{ type: "text", text: TREND_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Coach: ${input.name}\nMonthly scores:\n${series}` }],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : fallbackTrend(input);
  } catch (err) {
    logger.warn("analyzeTrend failed; using template fallback", { err });
    return fallbackTrend(input);
  }
}
