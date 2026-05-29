# Optimum Swim School — KPI & Bonus Dashboard

A rebuild of the original single-file `KPI_Calculator_v11.1.html` as a deployable
Next.js app with cloud-saved monthly history, AI-assisted instructor-name merging,
per-coach manual inputs with a readiness checklist, month-over-month trends, and
real Claude performance analysis.

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
cp .env.example .env.local   # set APP_PASSWORD + SESSION_SECRET (>=32 chars)
npm run dev
```

With no `POSTGRES_URL`, local dev uses an in-process **PGlite** database persisted to
`./.pglite` (gitignored) — no cloud DB needed to try it. With no `ANTHROPIC_API_KEY`,
AI name-merging is skipped (deterministic merge still works) and analysis falls back to
a template. Default login password in dev is `swim123`.

```bash
npm test         # KPI engine + DB integration tests (Vitest)
npm run lint
npm run build
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_PASSWORD` | yes (prod) | Single shared login password. |
| `SESSION_SECRET` | yes | ≥32 random chars; encrypts the session cookie. |
| `POSTGRES_URL` | yes (prod) | Postgres connection string (Neon/Vercel pooled URL). Unset → PGlite locally. |
| `ANTHROPIC_API_KEY` | optional | Enables AI name-merging + analysis. |

## Deploy to Vercel

1. Push this repo to GitHub and **Import** it into Vercel (framework auto-detected as Next.js).
2. In the project's **Storage** tab, add a **Postgres** database (Neon). Vercel injects
   `POSTGRES_URL` (use the pooled connection string).
3. In **Settings → Environment Variables**, add `APP_PASSWORD`, `SESSION_SECRET`
   (e.g. `openssl rand -base64 32`), and optionally `ANTHROPIC_API_KEY`.
4. Create the tables once against the production database:
   ```bash
   POSTGRES_URL="<your prod url>" npm run db:migrate
   ```
   (or `npm run db:push`). Re-run after future schema changes.
5. Deploy. The app is gated by the shared password on every route.

> `.npmrc` sets `legacy-peer-deps=true` so installs succeed on the Next 16 / React 19
> peer ranges — keep it for Vercel's install step.
