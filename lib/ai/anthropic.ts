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
// Instructor assessment analysis: turn an observation form into a coaching note.
// ---------------------------------------------------------------------------

export interface AssessmentAnalyzeInput {
  name: string;
  totalPercent: number;
  finalGrade: string;
  /** Each sub-category's earned points out of its weight. */
  subScores: { label: string; score: number; weight: number }[];
  comments?: string;
  /** Optional recent history (newest first) for a trend read. */
  history?: { observedOn: string; totalPercent: number }[];
}

const ASSESSMENT_SYSTEM = `You are an instructor-development coach for a swim school. Given an instructor's observation-form scores by category (each out of its weight) plus the assessor's comments and any recent score history, write a concise insight (2–4 sentences) for management. Name the strongest and weakest category, note the trend if history is given, and give one concrete, actionable development focus. Be direct and specific; no preamble, no bullet lists.`;

function fallbackAssessmentAnalysis(input: AssessmentAnalyzeInput): string {
  const ranked = [...input.subScores]
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.score / b.weight - a.score / a.weight);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  let sentiment = "Solid all-round teaching.";
  if (input.totalPercent >= 85) sentiment = "Excellent — well above expectations.";
  else if (input.totalPercent < 55) sentiment = "Developing — needs focused support.";
  if (!top || !bottom || top.label === bottom.label) {
    return `${input.name}: ${sentiment} (${input.totalPercent.toFixed(0)}%, ${input.finalGrade}).`;
  }
  return `${input.name}: ${sentiment} (${input.totalPercent.toFixed(0)}%, grade ${input.finalGrade}). Strongest area is ${top.label}; prioritise development in ${bottom.label}.`;
}

/** Generate a short development insight from an assessment, falling back to a template. */
export async function analyzeAssessment(input: AssessmentAnalyzeInput): Promise<string> {
  const client = getClient();
  if (!client) return fallbackAssessmentAnalysis(input);

  const cats = input.subScores
    .map((s) => `- ${s.label}: ${s.score.toFixed(1)} / ${s.weight}`)
    .join("\n");
  const trend = input.history?.length
    ? `\nRecent scores (newest first): ${input.history.map((h) => `${h.observedOn} ${h.totalPercent.toFixed(0)}%`).join(", ")}`
    : "";

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [{ type: "text", text: ASSESSMENT_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `Instructor: ${input.name}\nFinal: ${input.totalPercent.toFixed(1)}% (grade ${input.finalGrade})\nCategory scores:\n${cats}${trend}${input.comments ? `\nAssessor comments: ${input.comments}` : ""}`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : fallbackAssessmentAnalysis(input);
  } catch (err) {
    logger.warn("analyzeAssessment failed; using template fallback", { err });
    return fallbackAssessmentAnalysis(input);
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

// ---------------------------------------------------------------------------
// Bonus/allowance audit narration (feature B): the FINDINGS are computed
// deterministically in lib/kpi/audit.ts — Claude only turns them into prose.
// ---------------------------------------------------------------------------

export interface AuditFindingForNarration {
  coach: string;
  severity: string;
  message: string;
}

const AUDIT_SYSTEM = `You are a payroll auditor for a swim school. You are given a list of pre-computed audit findings (already verified by deterministic checks) about one month's KPI bonus run vs the allowance records. Write a brief management summary (2–4 sentences, plain prose): how many issues, which are most serious, and what to check first. Do NOT invent findings beyond the list. If the list is empty, say the month reconciles cleanly.`;

/** Narrate deterministic audit findings. Falls back to a terse template. */
export async function narrateAudit(findings: AuditFindingForNarration[]): Promise<string> {
  const client = getClient();
  const fallback =
    findings.length === 0
      ? "No discrepancies found — the month reconciles cleanly."
      : `${findings.length} issue(s) flagged. Highest priority: ${
          findings.find((f) => f.severity === "high")?.message ?? findings[0].message
        }`;
  if (!client) return fallback;

  const list = findings.map((f) => `- [${f.severity}] ${f.coach}: ${f.message}`).join("\n");
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [{ type: "text", text: AUDIT_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: findings.length
            ? `Audit findings:\n${list}\n\nSummarize for management.`
            : "There are no audit findings this month.",
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : fallback;
  } catch (err) {
    logger.warn("narrateAudit failed; using template fallback", { err });
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Q&A data insight (feature A): answer a question about ALREADY-AGGREGATED run
// data. Claude does NOT build a query — it reasons over a compact data summary
// we pass in, so it can't produce a wrong/expensive DB query.
// ---------------------------------------------------------------------------

export interface QueryInput {
  /** The user's natural-language question. */
  question: string;
  /** A compact, pre-built text summary of the runs/coaches data to reason over. */
  dataSummary: string;
}

const QUERY_SYSTEM = `You are a data assistant for a swim school's payroll tool. Answer the user's question using ONLY the data summary provided — it contains the saved monthly KPI results (coaches, scores, grades, payouts, periods). Be concise and specific with names and numbers. If the answer isn't in the data, say so plainly. Never invent figures.`;

/** Answer a question about the provided run data. Needs a key (no useful template). */
export async function answerDataQuestion(input: QueryInput): Promise<string> {
  const client = getClient();
  if (!client) {
    return "AI query needs ANTHROPIC_API_KEY to be configured. Use the History and Trends pages to explore the data directly.";
  }
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: [{ type: "text", text: QUERY_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `Data:\n${input.dataSummary}\n\nQuestion: ${input.question}`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text"
      ? text.text.trim()
      : "No answer was returned. Try rephrasing the question.";
  } catch (err) {
    logger.warn("answerDataQuestion failed", { err });
    return "Could not answer that right now. Please try again.";
  }
}

// ---------------------------------------------------------------------------
// KPI target suggestion (feature #3a): recommend min/max targets from the actual
// distribution of recent results. Advisory — the user still edits Settings.
// ---------------------------------------------------------------------------

export interface TargetStat {
  name: string;
  currentMin: number;
  currentMax: number;
  achievedMin: number;
  achievedMedian: number;
  achievedMax: number;
  count: number;
}

const TARGET_SYSTEM = `You are a KPI analyst for a swim school. For each metric you are given the CURRENT target min/max and the distribution of what coaches actually achieved last period (min, median, max, sample size). Recommend whether to keep or adjust each target, and to what, so targets are challenging but attainable. Keep it brief (one short line per metric). These are suggestions only — the manager applies them manually — so be clear and conservative, and note when the sample is small.`;

function fallbackTargets(stats: TargetStat[]): string {
  if (stats.length === 0) return "No recent metric data to base target suggestions on.";
  return stats
    .map(
      (s) =>
        `${s.name}: current ${s.currentMin}–${s.currentMax}; achieved median ${s.achievedMedian.toFixed(2)} (range ${s.achievedMin.toFixed(2)}–${s.achievedMax.toFixed(2)}, n=${s.count}).`,
    )
    .join("\n");
}

/** Suggest KPI target adjustments from the achieved distribution. */
export async function suggestTargets(stats: TargetStat[]): Promise<string> {
  const client = getClient();
  if (!client || stats.length === 0) return fallbackTargets(stats);

  const lines = stats
    .map(
      (s) =>
        `- ${s.name}: current target ${s.currentMin}–${s.currentMax}; achieved min ${s.achievedMin.toFixed(2)}, median ${s.achievedMedian.toFixed(2)}, max ${s.achievedMax.toFixed(2)} (n=${s.count})`,
    )
    .join("\n");
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: [{ type: "text", text: TARGET_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Metrics:\n${lines}\n\nRecommend target adjustments.` }],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : fallbackTargets(stats);
  } catch (err) {
    logger.warn("suggestTargets failed; using template fallback", { err });
    return fallbackTargets(stats);
  }
}

// ---------------------------------------------------------------------------
// Retention check-in note (feature #3b): narrate the DETERMINISTIC watch signals
// from lib/kpi/retention.ts. Heavily caveated and supportive by design — this is
// not an attrition prediction and must never drive an employment decision.
// ---------------------------------------------------------------------------

export interface RetentionForNarration {
  name: string;
  level: string;
  reasons: string[];
}

const RETENTION_SYSTEM = `You are an HR support assistant for a swim school. You are given coaches whose KPI SCORES have declined, with the exact figures behind each flag. Write a brief, supportive note for the manager (2–4 sentences) suggesting a constructive check-in with the coaches who show the clearest decline.

Critical rules:
- This is based ONLY on KPI scores — it is NOT a prediction that anyone will leave, and must NOT be framed as one.
- Do NOT speculate about reasons, personal circumstances, or intentions. Stick to the score facts given.
- Frame it as an opportunity to offer support, not as a risk to manage. Never recommend any employment action.
- If the list is empty, say scores look stable and no check-in is indicated.`;

/** Narrate retention watch signals supportively. Falls back to a plain template. */
export async function narrateRetention(items: RetentionForNarration[]): Promise<string> {
  const client = getClient();
  const fallback =
    items.length === 0
      ? "KPI scores look stable across coaches — no check-in indicated by the data."
      : `Consider a supportive check-in with ${items.map((i) => i.name).join(", ")} — their KPI scores have dipped recently. This reflects scores only, not any prediction about their plans.`;
  if (!client) return fallback;

  const list = items
    .map((i) => `- ${i.name} (${i.level}): ${i.reasons.join(" ")}`)
    .join("\n");
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [{ type: "text", text: RETENTION_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: items.length
            ? `Coaches with declining KPI scores:\n${list}\n\nWrite the supportive check-in note.`
            : "No coaches show a declining KPI trend this period.",
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : fallback;
  } catch (err) {
    logger.warn("narrateRetention failed; using template fallback", { err });
    return fallback;
  }
}
