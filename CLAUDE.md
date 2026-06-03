@AGENTS.md

# Optimum Swim School — KPI & Bonus Dashboard

A deployable Next.js rebuild of the original single-file `KPI_Calculator_v11.1.html`
(vanilla JS + CDN libs). It uploads a monthly tutor-KPI CSV, AI-merges instructor account
names that belong to the same coach, computes KPI scores + bonus payout, shows a leaderboard
with per-coach detail, saves each month to a cloud database, and adds month-over-month trends,
editable scoring settings, and real Claude analysis. The whole app sits behind one shared
password.

> This file documents the project as built. It originated as a proposed rebuild plan; where
> the implementation diverged from that plan, this file reflects **the code**, not the proposal
> (see "Divergences from the original plan").

## Goal & decisions

Re-develop the legacy HTML tool — which had no real persistence (some `localStorage`) and a
hardcoded "AI analysis" template — into a maintainable app that:

- **Deploys to Vercel** and **saves past monthly records in a cloud database** (shared across devices).
- Is protected by a **single shared password** (env var) gating the whole app.
- Works on **mobile/tablet**, adds **month-over-month comparison/trends**, and replaces the fake
  analysis with **real Claude AI analysis**.
- Ships a **configurable scoring formula** (metrics enable/disable, weights, min/max, grade
  thresholds, center targets). **Defaults reproduce v11.1 exactly** so saved results stay comparable
  until Settings are changed.

## Tech stack (as built)

- **Next.js 16.2.6** (App Router, Turbopack) · **React 19.2.4** · **TypeScript**
- **Tailwind CSS v4** with a small in-repo component kit (`components/ui.tsx`) + `clsx`/`tailwind-merge`;
  **`lucide-react`** icons
- **PapaParse** — client-side CSV parsing
- **Recharts** — radar profile + trend charts
- **Drizzle ORM** over **Postgres** (Neon/Vercel via the `postgres` driver), with an in-process
  **PGlite** (`@electric-sql/pglite`) fallback for local dev (no cloud DB needed)
- **iron-session** (signed HttpOnly cookie) + Next 16 **`proxy.ts`** for the password gate
- **Anthropic SDK** (`@anthropic-ai/sdk`, model `claude-sonnet-4-6`, prompt caching) in server routes
- **Vitest** — locks the KPI engine + DB queries

## App structure

```
app/
  login/page.tsx                 # password entry
  (app)/layout.tsx               # protected shell + nav (authoritative iron-session check)
  (app)/page.tsx                 # Dashboard: upload CSV -> merge -> leaderboard + detail (client)
  (app)/history/page.tsx         # list saved monthly runs
  (app)/history/[id]/page.tsx    # read-only snapshot of one saved run (SSR renders stored scores)
  (app)/trends/page.tsx          # month-over-month score/payout charts
  (app)/settings/page.tsx        # edit metrics/weights/min-max/grades/targets
  api/auth/login|logout/route.ts
  api/config/route.ts            # GET/PUT singleton config
  api/coaches/route.ts           # GET coach profiles
  api/match-names/route.ts       # POST accounts -> Claude same-person clusters (no-op without key)
  api/analyze/route.ts           # POST breakdown -> Claude insight (template fallback)
  api/runs/route.ts              # GET list, POST save a run
  api/runs/[id]/route.ts         # GET one, DELETE
lib/
  kpi/csv.ts                     # CSV header mapping + getCleanName (deterministic name pass)
  kpi/metrics.ts                 # metric library, default configs, grade thresholds, center targets
  kpi/calc.ts                    # pure scoring engine (calcMetricScore, calculateScores, grades, group)
  kpi/coach.ts                   # computeCoach: final score + payout + readiness for one coach
  kpi/merge.ts                   # account grouping + known-coach aliases
  kpi/types.ts                   # KPI/config types
  db/{schema,index,queries}.ts   # Drizzle schema, client (Postgres|PGlite), queries
  db/migrations/                 # drizzle-kit SQL + snapshots
  auth/session.ts                # iron-session helpers, isAuthed(), expectedPassword()
  ai/anthropic.ts                # match-names + analyze, both degrade gracefully without a key
  types.ts utils.ts              # shared types; rm() ringgit formatter, cn() class merge
components/                      # dashboard, nav, ui, radar-chart, trends-view, settings-form, ...
proxy.ts                         # optimistic auth gate (Next 16 renamed middleware -> proxy)
```

## KPI scoring engine (`lib/kpi`)

The math is **faithful to v11.1 by default**. The metric scoring curve in `calcMetricScore`
reproduces the original; the redesign proposed during planning (continuous floor curve, capped
student growth) was **not** adopted.

**Per-metric score** `calcMetricScore(val, min, max, mode)` → a multiplier (typically 0.5–1.5):

- `growth` (Student Number): `val ≤ min → val/min`; else `1 + 0.72·ln((val−min)/min + 1)`. **Uncapped.**
- `standard` (most metrics): `val < min → 0.5` (a deliberate cliff); `val ≥ max → 1.5`; else
  `1 + ((val−min)/(max−min))^1.5 · 0.5`.
- `lower` (lower-is-better, opt-in only): mirror of `standard` — `val ≤ min → 1.5`, `val ≥ max → 0.5`.

Percent metrics auto-normalize either scale (accepts `0.85` or `85`). Weighted scores are summed
**without renormalization** — the Settings UI enforces that enabled weights total 100%.

**Coach assembly** (`computeCoach`): `personalScore` = weighted metric sum. For a **Pool Supervisor**
with a group config, `finalScore = (personal + group) / 2`; otherwise `finalScore = personal`. The
**group score** sums each center's score × `hours/40` over one or two centers, with the student-number
target set to the center target (min = target, max = 2×target). **`payout = finalScore × teachingAllowance`.**

**Grades:** `S ≥ 1.25`, `A ≥ 1.0`, `B ≥ 0.75`, else `C`.

**Default metrics** (`METRIC_LIBRARY`, all configurable):

| Metric | Mode | Default min/max | Personal w | Center w |
| --- | --- | --- | --- | --- |
| Student Number | growth | 140 / 280 | 0.40 | 0.40 |
| Upgrade Rate `LevelUp/TotalColor` | standard | 0.2 / 0.4 | 0.12 | 0.15 |
| Progress Rate `1 − Black/TotalColor` | standard | 0.7 / 0.9 | 0.12 | 0.15 |
| Efficiency Ratio `Attended/TotalStudent` | standard | 3.0 / 5.0 | 0.12 | 0.15 |
| Retention Rate `1 − Stop/TotalStudent` | standard | 0.97 / 0.99 | 0.12 | 0.15 |
| Mgmt Assessment (manual) | standard | 70 / 90 | 0.12 | — |

Two extras ship **disabled** (opt-in via Settings): **Net Progression** `(LevelUp−Downgrade)/TotalColor`
and **Downgrade Rate** `Downgrade/TotalColor` (lower-is-better). Center student targets live in
`DEFAULT_CENTER_TARGETS` (e.g. HQ/Berkeley 450, Puchong Kinrara & Subang USJ 750; fallback 140).

**Readiness:** a coach is "incomplete" when a required input is missing — teaching allowance,
management assessment (when that metric is enabled), or group/center hours (for supervisors).

## Name merge

1. **Deterministic pass** (client): `getCleanName` strips `[BK]`-style and ` - …` suffixes and
   upper-cases, grouping obvious same-person accounts.
2. **Claude reconciliation** (`/api/match-names`): groups remaining same-person accounts (branch
   suffixes, `HARVEST`/numbered variants, spelling). Conservative — only confident 2+ groups;
   no-ops to `[]` without `ANTHROPIC_API_KEY`.
3. **Known aliases**: saved coach profiles contribute aliases so future months merge automatically.

Groupings are editable in the UI (split / move accounts) before saving.

## Data model (Drizzle / Postgres)

- **`config`** — singleton row (`id = 1`), `data` jsonb = `{ personalKpi, centerKpi, centerTargets,
  gradeThresholds }`. Seeded with v11.1 defaults on first read. Replaces the old `localStorage`.
- **`runs`** — saved months: `periodLabel`, `filename`, `csvRows` jsonb, `configSnapshot` jsonb,
  `coachResults` jsonb, `status` (`"finalized"`), `createdAt`. The config snapshot makes each saved
  month **reproducible** after later config edits; `coachResults` powers History detail (SSR) + Trends.
- **`coaches`** — profiles upserted from each saved run: `canonicalName`, `aliases[]`, `center`,
  `defaultPosition`, `lastAllowance`, `lastMgmtAssessment(+At)`, `active`. Drives **carry-over**
  (pre-filled allowance, mgmt-assessment age) and alias-based merge next month.

## Auth

Single shared password, no password stored in DB or client bundle.

- **`proxy.ts`** is an *optimistic* gate: redirects to `/login` when the `kpi_session` cookie is
  **absent**. Public paths: `/login`, `/api/auth/*`. (Matcher excludes `_next/static`, images, favicon.)
- **Authoritative** checks: the `(app)` layout and `isAuthed()` in every API route validate the
  iron-session via decryption — so a present-but-invalid cookie still gets a JSON `401`.
- `/api/auth/login` compares to `APP_PASSWORD` (dev fallback `swim123` when not production);
  `SESSION_SECRET` (≥ 32 chars) encrypts the cookie. `/api/auth/logout` destroys the session.

## AI (`lib/ai/anthropic.ts`)

`claude-sonnet-4-6` with prompt caching on the system prompt. **Both calls degrade gracefully**
without `ANTHROPIC_API_KEY`: `matchInstructorNames` → `[]` (deterministic merge still applies),
`analyzePerformance` → a template naming the strongest/weakest metric.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_PASSWORD` | yes (prod) | Single shared login password (dev falls back to `swim123`). |
| `SESSION_SECRET` | yes | ≥ 32 random chars; encrypts the session cookie. |
| `POSTGRES_URL` (or `DATABASE_URL`) | yes (prod) | Postgres connection string. Unset → PGlite at `./.pglite`. |
| `ANTHROPIC_API_KEY` | optional | Enables AI name-merging + analysis. |

`.env.local` is loaded automatically in dev. `.npmrc` sets `legacy-peer-deps=true` for the
Next 16 / React 19 peer ranges — keep it for Vercel installs.

## Commands

```bash
npm run dev          # next dev (Turbopack)
npm run build        # next build       npm run start
npm run lint         # eslint           npm run typecheck   # tsc --noEmit
npm test             # vitest run (KPI engine + DB queries)
npm run db:generate  # drizzle-kit generate
npm run db:migrate   # apply migrations (run once against prod DB)   npm run db:push
```

## Conventions & gotchas

- **Next 16**: middleware is **`proxy.ts`**, not `middleware.ts`. Per `AGENTS.md`, read
  `node_modules/next/dist/docs/` before using Next APIs — several differ from older versions.
- **No `POSTGRES_URL`** locally → PGlite persists to `./.pglite` (gitignored). No cloud DB required to run.
- **KPI compute is client-side**: `computeCoach`/`calc.ts` run only in `components/dashboard.tsx`
  (`"use client"`) — the leaderboard, radar, and merge editor render in the browser. No server route
  computes scores; the engine is locked by Vitest (`lib/kpi/calc.test.ts`, e.g. `COBYS [BK]` → `0.9354`).
- **Saved scores are SSR'd**: History detail renders the stored `coachResults`, so it shows scores
  without re-computing.
- **API auth asymmetry**: a *cookieless* API request is redirected (`307 → /login`) by the proxy, not
  given JSON `401`; the route-level `401` only fires for present-but-invalid cookies.
- **CSV headers** are mapped flexibly (`tr_name→Instructor`, `cr_name→Center`, `TTL-COLOR→TotalColor`,
  `UP→LevelUp`, `STUDENT_STOP→Stop`, `STUDENT_ATTENDED_CLASS→Attended`, …) in `lib/kpi/csv.ts`.

## Divergences from the original plan

- **Next.js 16** (plan said 15) → the gate is `proxy.ts`, not `middleware.ts`.
- **In-repo Tailwind components** (`components/ui.tsx`), not **shadcn/ui**.
- **PGlite** local fallback was added so the app runs with no cloud DB (not in the original plan).
- The **scoring-curve redesign** (continuous floor, capped growth) was **not** implemented; defaults
  stay byte-for-byte v11.1. What landed beyond v11.1: the configurable metric registry, a
  **lower-is-better** mode, and the two opt-in metrics above.

## Deploy

Import to Vercel → add Postgres (Neon) → set `APP_PASSWORD` / `SESSION_SECRET` /
`ANTHROPIC_API_KEY` → run `npm run db:migrate` against the prod DB → deploy. See `README.md` for
step-by-step details.

## gstack (recommended)

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted workflows.
Install it for the best experience:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Skills like /qa, /ship, /review, /investigate, and /browse become available after install.
Use /browse for all web browsing. Use ~/.claude/skills/gstack/... for gstack file paths.
