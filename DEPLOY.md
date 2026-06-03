# Deploying Optimum Payroll Tools

A step-by-step checklist for a working production deploy on **Vercel + Postgres (Neon)**.
The app is **per-user** (email + password, roles); there is no shared password.

When in doubt, open **`/setup`** on the deployed URL — it runs every check below and tells
you exactly what is still missing (it's public and exposes no secrets).

---

## 1. Import the repo into Vercel

Push to GitHub → **Add New… → Project** in Vercel → import this repo. The framework is
auto-detected as Next.js. `.npmrc` already sets `legacy-peer-deps=true` so the install
succeeds on the Next 16 / React 19 peer ranges — keep it.

## 2. Attach a Postgres database

In the project's **Storage** tab, add a **Postgres** database (Neon). Vercel injects the
connection string as `POSTGRES_URL` — use the **pooled** URL.

> ⚠️ Make sure the database variable is exposed to **both Production and Preview**
> environments. Without `POSTGRES_URL` the app cannot fall back to PGlite on Vercel
> (serverless filesystems are read-only) and will fail to start with an actionable error.

## 3. Set environment variables

**Settings → Environment Variables:**

| Variable | Required | Notes |
| --- | --- | --- |
| `POSTGRES_URL` (or `DATABASE_URL`) | yes | Injected by step 2; pooled connection string. |
| `SESSION_SECRET` | yes | ≥ 32 random chars. Generate with `openssl rand -base64 32`. |
| `SUPER_ADMIN_EMAIL` | yes (first run) | Email for the first super admin. |
| `SUPER_ADMIN_PASSWORD` | yes (first run) | Password for the first super admin. |
| `ANTHROPIC_API_KEY` | optional | Enables AI name-merge + analysis; omitted = graceful fallback. |
| `SENTRY_DSN` | optional | Enables Sentry server error monitoring; omitted = no-op. |

## 4. Migrations

Migrations **auto-apply on first DB connect**, so a fresh database needs no manual SQL.
To run them explicitly (or after a schema change) against production:

```bash
POSTGRES_URL="<your prod pooled url>" npm run db:migrate
```

## 5. Deploy and verify

1. Deploy.
2. Open **`/setup`** on the deployed URL. Every required check should be green:
   - **Production database** — `POSTGRES_URL` is set.
   - **Database connection & schema** — connected, migrations applied.
   - **Login account** — once `SUPER_ADMIN_*` are set, the first sign-in seeds the super admin.
   - **Session secret** — `SESSION_SECRET` ≥ 32 chars.
   - **Claude AI** — informational; safe to leave off.
3. Go to **`/login`** and sign in with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`.
4. Create the rest of the accounts in-app (**Staff → Users**) and set roles / permissions.

> The first sign-in is what actually seeds the super admin (from the env vars). If
> `/setup` shows "No accounts yet", that's expected until you complete a sign-in.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Page errors on first load | No `POSTGRES_URL` on Vercel | Attach Postgres (step 2), redeploy. |
| "No accounts exist yet" on login | `SUPER_ADMIN_*` not set | Set both env vars, redeploy, sign in. |
| Everyone logged out after deploy | Session shape / `SESSION_SECRET` changed | Expected once — users re-log in. |
| AI merge/analysis does nothing | No `ANTHROPIC_API_KEY` | Optional; set it to enable AI. |

Hit **`/api/health`** for the same checks as JSON (useful for uptime monitors / `curl`).
