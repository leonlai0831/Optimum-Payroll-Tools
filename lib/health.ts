import { countUsers } from "@/lib/db/queries";

/**
 * Deployment self-check. Gathers the handful of things a fresh deploy needs to
 * actually work — a reachable Postgres, applied migrations, a login account, a
 * real session secret — and reports each as a check the admin can read.
 *
 * SECURITY: this report is served on an unauthenticated route (`/api/health`)
 * and rendered on the public `/setup` page so a broken deploy can be diagnosed
 * *before* anyone can log in. It therefore exposes only booleans + generic
 * hints — never secret values, never the database connection string.
 */

export type Severity = "critical" | "warning" | "info";

export interface HealthCheck {
  name: string;
  ok: boolean;
  severity: Severity;
  detail: string;
}

export interface HealthReport {
  status: "ok" | "degraded" | "error";
  checks: HealthCheck[];
  generatedAt: string;
}

/** A failing `critical` → error; a failing `warning` → degraded; `info` never downgrades. */
export function overallStatus(checks: HealthCheck[]): HealthReport["status"] {
  if (checks.some((c) => !c.ok && c.severity === "critical")) return "error";
  if (checks.some((c) => !c.ok && c.severity === "warning")) return "degraded";
  return "ok";
}

export async function getHealthReport(): Promise<HealthReport> {
  const checks: HealthCheck[] = [];
  const isProd = process.env.NODE_ENV === "production";
  const onServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const dbUrlSet = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);

  // 1. Production database configured. On a serverless host the PGlite fallback
  //    can't run (read-only filesystem), so a missing URL there is fatal.
  checks.push({
    name: "Production database",
    ok: dbUrlSet || !onServerless,
    severity: "critical",
    detail: dbUrlSet
      ? "POSTGRES_URL is set."
      : onServerless
        ? "No POSTGRES_URL/DATABASE_URL. Attach Postgres (Neon/Vercel) to Production AND Preview, then redeploy — the PGlite fallback can't run on a read-only serverless filesystem."
        : "No POSTGRES_URL set; using the local PGlite fallback (./.pglite). Fine for local dev, not for production.",
  });

  // 2. Connect + migrate + query in one round-trip. A successful countUsers()
  //    forces getDb() (which auto-applies migrations) and proves the schema.
  let userCount: number | null = null;
  try {
    userCount = await countUsers();
    checks.push({
      name: "Database connection & schema",
      ok: true,
      severity: "critical",
      detail: "Connected and migrations are applied (the users table is queryable).",
    });
  } catch (e) {
    checks.push({
      name: "Database connection & schema",
      ok: false,
      severity: "critical",
      detail: e instanceof Error ? e.message : "Could not connect to the database.",
    });
  }

  // 3. An account exists to log in with. The first super admin is seeded from
  //    SUPER_ADMIN_EMAIL/PASSWORD on the next login attempt.
  if (userCount !== null) {
    const hasUsers = userCount > 0;
    const credsSet = Boolean(process.env.SUPER_ADMIN_EMAIL && process.env.SUPER_ADMIN_PASSWORD);
    checks.push({
      name: "Login account",
      ok: hasUsers,
      severity: "critical",
      detail: hasUsers
        ? `${userCount} account${userCount === 1 ? " exists" : "s exist"}.`
        : credsSet || !isProd
          ? "No accounts yet — the first super admin is seeded from SUPER_ADMIN_EMAIL/PASSWORD on the next sign-in."
          : "No accounts and no SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD set. Set both, then sign in to bootstrap the super admin.",
    });
  }

  // 4. Session secret. Without a real one, cookies use an insecure built-in
  //    fallback — fatal in production, just a warning locally.
  const secret = process.env.SESSION_SECRET ?? "";
  const secretOk = secret.length >= 32;
  checks.push({
    name: "Session secret",
    ok: secretOk,
    severity: isProd ? "critical" : "warning",
    detail: secretOk
      ? "SESSION_SECRET is set (≥ 32 chars)."
      : "SESSION_SECRET is missing or under 32 chars — sessions fall back to an insecure built-in secret. Set a random 32+ character value (e.g. `openssl rand -base64 32`).",
  });

  // 5. Claude AI — optional. Absence degrades gracefully, so this never fails.
  const aiKey = Boolean(process.env.ANTHROPIC_API_KEY);
  checks.push({
    name: "Claude AI (optional)",
    ok: aiKey,
    severity: "info",
    detail: aiKey
      ? "ANTHROPIC_API_KEY is set — AI name-merge and analysis are enabled."
      : "No ANTHROPIC_API_KEY — AI features degrade gracefully (deterministic name-merge + template analysis).",
  });

  return { status: overallStatus(checks), checks, generatedAt: new Date().toISOString() };
}
