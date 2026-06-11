# Optimum Payroll Suite

Optimum Swim School's payroll calculators. The post-login hub lists the tools — **Staff
Allowance** and **Instructor KPI Bonus** today, with **Admin KPI Bonus** planned.

The **Instructor KPI Bonus** tool (documented below) is a rebuild of the original single-file
`KPI_Calculator_v11.1.html` as a deployable Next.js app with cloud-saved monthly history,
AI-assisted instructor-name merging, per-coach manual inputs with a readiness checklist,
month-over-month trends, and real Claude performance analysis.

## What it does

1. **Upload** the monthly tutor-KPI CSV.
2. **AI merge** — a deterministic clean-name pass plus Claude reconciliation auto-groups
   the account names that belong to the same coach (e.g. `HONG LI [BK]` + `HONG LI HARVEST`).
   Groupings are editable (split / move accounts).
3. **Readiness list** — every coach is listed with their per-month manual inputs
   (position, teaching allowance, management assessment). Coaches missing data are
   flagged; allowance is pre-filled from last month and the management-assessment age
   is shown so you just confirm or update it.
4. **Leaderboard + detail** — scores, grades, and bonus payout per coach, with a radar
   profile, score breakdown, and a Claude-generated insight.
5. **Save month** → persisted to the database; remembered coach profiles make next
   month's merge + data entry faster.
6. **History** and **Trends** — browse past months and compare coaches over time.
7. **Settings** — enable/disable metrics, edit weights, min/max, center targets, and
   grade thresholds. The scoring math matches v11.1 by default.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Drizzle ORM ·
Postgres (Neon/Vercel) with a PGlite fallback for local dev · iron-session ·
Anthropic SDK · Recharts · Vitest.

## Local development

```bash
npm install
cp .env.example .env.local   # set SESSION_SECRET (>=32 chars); see the table below
npm run dev
```

With no `POSTGRES_URL`, local dev uses an in-process **PGlite** database persisted to
`./.pglite` (gitignored) — no cloud DB needed to try it. With no `ANTHROPIC_API_KEY`,
AI name-merging is skipped (deterministic merge still works) and analysis falls back to
a template. In dev, the first sign-in is bootstrapped to `admin@local` / `swim123`
(override with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`).

```bash
npm test         # KPI engine + DB integration tests (Vitest)
npm run lint
npm run build
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `POSTGRES_URL` (or `DATABASE_URL`) | yes (prod) | Postgres connection string (Neon/Vercel pooled URL). Unset → PGlite locally. |
| `SESSION_SECRET` | yes | ≥32 random chars; encrypts the session cookie. |
| `SUPER_ADMIN_EMAIL` | yes (prod, first run) | Email of the first super admin, seeded on the first sign-in. |
| `SUPER_ADMIN_PASSWORD` | yes (prod, first run) | Password for that first super admin. |
| `ANTHROPIC_API_KEY` | optional | Enables AI name-merging + analysis. |
| `SENTRY_DSN` | optional | Enables Sentry server error monitoring. Unset → no-op. |

> Auth is **per-user** (email + password, roles). The first super admin is bootstrapped
> from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`; after that, manage accounts in-app.

## Deploy to Vercel

See **[DEPLOY.md](./DEPLOY.md)** for the full step-by-step checklist. In short:

1. **Import** the repo into Vercel (Next.js auto-detected).
2. Add a **Postgres** database (Storage tab → Neon) so `POSTGRES_URL` is injected for
   **Production and Preview**.
3. Set `SESSION_SECRET` (`openssl rand -base64 32`), `SUPER_ADMIN_EMAIL`,
   `SUPER_ADMIN_PASSWORD`, and optionally `ANTHROPIC_API_KEY`.
4. Migrations auto-apply on first connect; you can also run them explicitly:
   ```bash
   POSTGRES_URL="<your prod url>" npm run db:migrate
   ```
5. Deploy, then open **`/setup`** to confirm every check is green before signing in.

> **`/setup`** (and the JSON at **`/api/health`**) are public, no-auth diagnostics that
> report what a deploy is still missing — without ever exposing secret values.

> The Vercel **project name** (and its default `*.vercel.app` URL) is set in the dashboard under
> **Settings → General** — it's independent of the in-app product name and isn't stored in this repo.

> `.npmrc` sets `legacy-peer-deps=true` so installs succeed on the Next 16 / React 19
> peer ranges — keep it for Vercel's install step.
