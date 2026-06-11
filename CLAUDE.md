@AGENTS.md

# Optimum People Hub (formerly the KPI & Bonus Dashboard)

A multi-module staff-operations suite for Optimum Swim School / Optimum Fit —
launcher + per-brand modules: Staff Allowance, **Freelancer Payment**, Instructor
KPI Bonus, **Student Progress**, Workforce (directory + Payees), Instructor
Assessment, Lesson Plan, Staff Earnings (Fit), and System administration. It grew
out of a deployable Next.js rebuild of the original single-file `KPI_Calculator_v11.1.html`
(vanilla JS + CDN libs). It uploads a monthly tutor-KPI CSV, AI-merges instructor account
names that belong to the same coach, computes KPI scores + bonus payout, shows a leaderboard
with per-coach detail, saves each month to a cloud database, and adds month-over-month trends,
editable scoring settings, and real Claude analysis. Auth is per-user accounts with
roles + a capability matrix (see "Auth"); the original shared password is long gone.

> This file documents the project as built. It originated as a proposed rebuild plan; where
> the implementation diverged from that plan, this file reflects **the code**, not the proposal
> (see "Divergences from the original plan").

## Goal & decisions

Re-develop the legacy HTML tool — which had no real persistence (some `localStorage`) and a
hardcoded "AI analysis" template — into a maintainable app that:

- **Deploys to Vercel** and **saves past monthly records in a cloud database** (shared across devices).
- Is protected by per-user accounts with roles + a capability matrix (originally one shared password).
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

> Historical sketch of the ORIGINAL core only — the suite now also has
> `/allowance`, `/freelancer`, `/progress`, `/staff`, `/assessment`,
> `/lesson-plans`, `/commission`, `/marketing` and `/system` sections, each
> documented in its own chapter below.

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

## Student Progress (`/progress`, `lib/ingest`)

The monthly student-data deliveries that feed the KPI calculator, extracted from the old KPI
"Uploads" tab into a standalone module: launcher card "Student Progress" (swim brand), section
tabs **Months** (`/progress`) + **Upload** (`/progress/upload`), both gated `run_kpi`; the old
`/kpi/ingests(/:id)` paths 301-redirect to `/progress(/:id)` (`next.config.ts`). Two doors feed
**one shared staging pipeline** (`stageKpiDelivery` in `lib/ingest/stage.ts`, locked by
`stage.test.ts`):

- **Machine push** — `POST /api/ingest/kpi` (`Authorization: Bearer <INGEST_API_KEY>`,
  constant-time compare in `lib/ingest/auth.ts`; 503 when the env var is unset, in-process
  per-IP rate limit, ~2 MB cap) accepts `{ periodLabel: "YYYY-MM", label?, rows }` with the
  **same flexible headers as the CSV upload** (normalized via `mapCsvRows`). The same endpoint
  also accepts a **raw CSV body** (`Content-Type: text/csv`, parsed in `lib/ingest/csv-body.ts`;
  `periodLabel` required + `label` optional as query params) with identical staging behavior.
  The proxy exempts `/api/ingest` from the cookie redirect (bearer auth happens in the route).
- **Manual upload** — `/progress/upload` (month picker + optional label + CSV parsed
  client-side with PapaParse + `mapCsvRows`, preview before submit) posts
  `{ periodLabel, label?, rows }` to `POST /api/progress/uploads`
  (`requireCapability("run_kpi")`), which calls the same helper with source `manual`.

Either way the data is **STAGED** in `kpi_ingests` (`pending → imported | discarded |
superseded` — never hard-deleted, rows stay viewable forever) with a `source` column
(`'api' | 'manual'`, shown as a badge), audited as `kpi_ingest.received`; a **re-delivery for
the same `periodLabel` atomically supersedes any still-pending earlier deliveries**
(imported/discarded ones are never touched, each flip is audited as `kpi_ingest.superseded`,
and the response reports `superseded: <count>`); a delivery for a period that is already
**closed** — a finalized run exists for it, or a delivery for it was already imported — gets a
`409 Conflict` before anything is staged, superseded, or audited (draft runs don't block;
reopen the run to push a correction). Owners (`run_kpi`) review on `/progress` (deliveries
grouped by month, newest first, with status + source badges and row counts): edit/add/delete
rows on **any non-superseded delivery** (PATCH `/api/kpi/ingests/[id]`, audited — pending,
imported and discarded records stay correctable; editing an *imported* delivery shows a banner
that the saved KPI run was computed from a snapshot and is NOT changed by these edits;
superseded is read-only), discard (status flip, pending-only), or "Load into calculator" →
`/kpi?ingest=<id>` seeds the dashboard with the staged rows (pending-only; same merge →
compute → save flow; filename shows the ingest label). Saving threads `ingestId` through
`POST /api/runs`, which marks the ingest `imported` + links `importedRunId`.

## Freelancer Payment (`lib/freelancer`, `/freelancer`)

Monthly pay for freelance swim instructors, faithful to the operator's
FREELANCER_CALCULATOR.xlsx. Positions REUSE the allowance tiers
(`coaches.allowanceTier` IS the freelancer position; subset A1–A3, PA, T0–T4, I1 —
plus the freelancer-only **CC** (RM26/42), which never writes back onto the tier —
`FREELANCER_POSITIONS`). Pure engine in `lib/freelancer/calc.ts` (locked by
`calc.test.ts`): **hourly rate** = `rates[position]` × center group (groupA =
HQ/BK/BT, groupB = the rest); **student result** = `1 − black/colour` (T1–T4 + I1
only, others forced 0); **commitment bonus** = matrix lookup with VLOOKUP-style
approximate match on BOTH axes (hours rows 0/31/41/51 × result columns 0/0.7/0.85,
0 for A1–A3); **attendance bonus** (default +0.2, fixed hours only) unless ANY
center row is marked absent. Per-center pay =
`rate × (replaced×(1+commit) + fixed×(1+commit+attend))`; payouts group per paying
company (OT = HQ/BK/BT/PK, OTG = KK/USJ, PJ, QSM, KM) plus free-form per-entity
extras; money rounds to 2dp at the end only. Defaults in
`lib/freelancer/defaults.ts`; numbers editable on `/freelancer/settings`
(swim_view/edit_settings; entities + center groups read-only for now).

Mirrors the Allowance module: singleton `freelancer_config` + `freelancer_runs`
(UNIQUE (period, canonicalName, **positionGroup**, **workPeriod**) upsert — one
record per position family (admin A1–A3 / teaching PA–I1 / cc) per work month,
so a person can hold several records in one payout batch; `workPeriod` earlier
than the payout month = a late submission (补交), KPI-bound and reported under
the work month like the operator's APRIL-rows-in-MAY-batch practice; config
snapshot per run; no period locks in v1). Saving recomputes server-side from a FRESH config read, audits
`freelancer.save`, and carries the position + **payee details** (icNo / bankName /
bankAccount — nullable `coaches` columns, also editable on the staff profile)
back onto the coach profile; blank payee fields never wipe stored values. Pages:
`/freelancer` (calculator, `?edit=<runId>`), `/freelancer/history` (grouped by
month; edit/delete/export), `/freelancer/settings`. `GET
/api/freelancer/export?period=` builds the **bank-transfer XLSX**
(`Freelancer-Payments-<period>.xlsx`, one worksheet per paying entity with a
payout: No / **Month** / Name / IC / Bank / Bank Code (`lib/freelancer/banks.ts`)
/ Account / Amount + TOTAL row — one row per (person, work month): position-family
records merge, late submissions keep their own Month-labelled row). Run routes gate on the `run_freelancer` capability (admin +
supervisor by default); the section gates the "swim" category like the other swim
surfaces.

**Student result ← KPI data**: the calculator binds a freelancer's black/colour
counts to an instructor account in the WORK month's KPI data (`input.kpiName`;
`GET /api/freelancer/kpi-result?period=&q=|&name=` reads the period's saved KPI
run, falling back to the latest pending ingest, aggregated by `getCleanName`).
The binding carries over via the latest run; counts stay editable; month P's
data arrives on the 1st of P+1 (the UI says so when empty). **CC bonus
semantics are an assumption awaiting the operator's confirmation**: hours-based
commitment applies, student result does not (like PA/T0).

**Payees (`/staff/payees`, Workforce tab)**: bulk entry of freelancer payee
details (IC / bank from `MALAYSIAN_BANKS` with live bank-code / account) with
search + sortable columns; one Save bulk-writes changed rows
(`PUT /api/coaches/payees`, freelancers only). **"Import summary file"** uploads
the operator's monthly Payment Summary xlsx (`lib/freelancer/import.ts`,
`POST /api/coaches/payees/import`): every payee across the entity sections
becomes/updates a freelancer profile — deduped, idempotent, non-freelancer name
collisions skipped + reported; the parser normalizes the file's real quirks
(swapped bank/account cells, MBB/RHB/ABMB shorthand, account junk, footers).

**Roster scoping (`lib/staff/roster.ts`, `rosterCoachesFor`)**: pay modules are
exclusive by employment type — Freelancer Payment searches ONLY
`employmentType === "freelancer"`; Allowance and KPI (links page, dashboard via
`/api/coaches?roster=kpi`) exclude freelancers; Assessment (and Lesson Plan,
which has no picker) sees every active INSTRUCTOR of either type, never front
desk.

## Lesson Plan (`lib/lesson-plan`, `/lesson-plans`)

Digital version of the two paper lesson-plan templates (swim group). Two types:
**actual** (free-form procedure rows) and **replacement** (Low/Medium/High level
types whose skill checklists are **hardcoded verbatim from the paper forms** in
`lib/lesson-plan/templates.ts` — Low = N/B/1, Medium = 2/3/4, High = 4/5/6/7 —
plus a 16-question yes/no self-evaluation). Review workflow:
`draft → submitted → approved / changes_requested`; **any content edit resets the
plan to draft** (last review note stays visible) and it can be resubmitted.
Capabilities: `edit_lesson_plans` (staff+supervisor+admin; creators see only
their own) and `review_lesson_plans` (supervisor+admin; see all, approve/request
changes). PDF export per type via `lib/reports/lesson-plan.ts` (pdf-lib, mirrors
the payslip builder). Table `lesson_plans`: promoted list columns + jsonb body;
access rules live in `lib/lesson-plan/access.ts`.

## Design language (since the 2026-06 redesign)

Notion-calm base × Optimum CI: warm paper canvas `#f6f5f4`, warm-grey ink ramp
(the Tailwind `gray-*` tokens are remapped — don't re-introduce cool greys),
hairline borders + the layered `.shadow-card` micro-shadow, Nunito 800 headings
with negative tracking, **pill** primary/secondary/danger buttons vs 8px
outline/ghost utility chrome, form fields `text-base` at phone widths (iOS
anti-zoom). The CI guide's footer wave is traced 1:1 into
`components/ci-wave.tsx` (launcher hero + login). Brand skins still come from
`data-brand` CSS variables. Every legacy side-scroll table has been converted to
`MobileCards`/`DesktopTable` — new data views must ship both layouts.

**Racing-stripe system (lg+ only; phones never render it)**: the gym deck's
four-bar motif (yellow/yellow/BLUE/yellow, blue third) runs as SVG dash-snakes
along paths with deck-style concentric corners. Login
(`components/login-stripe-band.tsx`): band enters from the left on the hero's
beat, rests pointing at the sign-in card behind a chevron arrow
(`components/stripe-arrow.tsx`), and on success EXTENDS — under the card, bend
up, out the top — while the screen camera-pans (login drops away,
`ArrivalSlide` descends the launcher). Launcher
(`components/hub-stripe-band.tsx`): a PERMANENT ribbon behind the content
(-z-10) draws itself in on every visit after the loading overlay clears. Both
bands share `stripeLegsMidX` so the cut is continuous, and their runs use the
**Web Animations API** with keyframe offsets computed from real segment lengths
(constant speed through bends — CSS keyframes' static percentages stutter);
reduced-motion is handled explicitly (WAAPI ignores the global CSS kill rule).
The login→launcher handshake lives in `lib/arrival.ts` (sessionStorage; also
stands the loading clip down for that navigation).

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

Per-user accounts (email + password, bcrypt-style hash in the `users` table) with roles
`super_admin / admin / supervisor / staff`; a role → capability matrix (`/system/permissions`)
gates everything else. Launcher **category visibility** (swim / fit / marketing) lives in the
same permissions matrix: each role has **default categories**, and the page's "User overrides"
tab can pin a per-user list (`users.visibleCategories`; NULL = inherit the role default).
`getCurrentUser()` resolves the effective list (override ?? role default; super_admin always
all) into `CurrentUser.visibleCategories`, enforced on the launcher AND in the brand-section
layouts. The old `/system/categories` page 301-redirects to `/system/permissions`.

**User management is hierarchy-scoped** (`ROLE_RANK` + `canViewUserRole` / `canManageUserRole`
in `lib/auth/types.ts`): a `manage_users` holder manages only accounts ranked **strictly below**
their own role, sees same-rank accounts **read-only** ("View only" rows; 403 on write), and never
sees higher-ranked accounts at all (lists filter them; direct API access 404s so existence doesn't
leak). Creating and role-assignment are limited to roles below the actor's own. super_admin is
all-access, incl. over fellow super_admins (last-active-super-admin safeguards still apply).
`/system/users` (page, layout, section-nav tab, launcher card) is gated on `manage_users`, not
`super_admin` — the other System pages (Audit log, Permissions) stay super_admin-only.

Staff/settings capabilities are **brand-scoped** — `swim_view_staff` / `fit_view_staff`,
`swim_edit_staff` / `fit_edit_staff`, `swim_view_settings` / `fit_view_settings`,
`swim_edit_settings` / `fit_edit_settings` — so e.g. a gym manager can hold the Optimum Fit
roster without seeing the swim directory. The retired cross-brand keys (`view_all_staff`,
`edit_staff`, `view_settings`, `edit_settings`) are migrated on read by
`normalizePermissionConfig` (`LEGACY_CAPABILITY_MAP`): a role that held a legacy key holds
BOTH scoped keys, so stored matrices keep their exact behavior. **Effective access to a brand
surface = launcher category visible AND capability granted** — the swim sections
(`/allowance`, `/kpi`, `/assessment`, `/lesson-plans`, `/staff` directory + settings) gate the
"swim" category just like `/commission` gates "fit" and `/marketing` gates "marketing"; the
one exception is `/staff/[id]` for the user's OWN coach profile, which stays reachable
regardless of category (the launcher's My Profile card is category-independent).

- **`proxy.ts`** is an *optimistic* gate: redirects to `/login` when the `kpi_session` cookie is
  **absent**. Public paths: `/login`, `/api/auth/*`. (Matcher excludes `_next/static`, images, favicon.)
- **Authoritative** checks: the `(app)` layout and `getCurrentUser()`/`requireCapability()` in API
  routes re-validate the iron-session against the DB — a present-but-invalid cookie or a
  deactivated account still gets a JSON `401`/`403`.
- `/api/auth/login` checks the `users` table (in-process rate-limit per IP+email; session is
  destroyed and re-issued on login). `SESSION_SECRET` (≥ 32 chars) encrypts the cookie.
- First boot seeds a super admin from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`
  (dev fallback `admin@local` / `swim123`).

## AI (`lib/ai/anthropic.ts`)

`claude-sonnet-4-6` with prompt caching on the system prompt. **Both calls degrade gracefully**
without `ANTHROPIC_API_KEY`: `matchInstructorNames` → `[]` (deterministic merge still applies),
`analyzePerformance` → a template naming the strongest/weakest metric.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | yes (prod, first boot) | Seeds the first super-admin account (dev falls back to `admin@local` / `swim123`). |
| `SESSION_SECRET` | yes | ≥ 32 random chars; encrypts the session cookie. |
| `POSTGRES_URL` (or `DATABASE_URL`) | yes (prod) | Postgres connection string. Unset → PGlite at `./.pglite`. |
| `ANTHROPIC_API_KEY` | optional | Enables AI name-merging + analysis. |
| `INGEST_API_KEY` | optional | Bearer key for the machine KPI push endpoint (`POST /api/ingest/kpi`). Unset → the endpoint answers 503. |

`.env.local` is loaded automatically in dev. `.npmrc` sets `legacy-peer-deps=true` for the
Next 16 / React 19 peer ranges — keep it for Vercel installs.

## Commands

```bash
npm run dev          # next dev (Turbopack)
npm run build        # next build       npm run start
npm run lint         # eslint           npm run typecheck   # tsc --noEmit
npm test             # vitest run (KPI engine + DB queries)
npm run db:generate  # drizzle-kit generate
npm run db:migrate   # apply migrations explicitly (optional; auto-applied on first connect)   npm run db:push
```

## Conventions & gotchas

- **Mobile-first (hard rule).** Management works primarily on phones, so design every view
  mobile-first: base styles target small screens, `sm:`/`md:`/`lg:` add desktop. **Data tables
  must not rely on horizontal scroll** on phones — use a **cards-on-mobile / table-on-desktop**
  pattern via the shared `MobileCards` / `DesktopTable` wrappers in
  `components/responsive-table.tsx` (they flip at `lg`; reference card markup: the KPI
  leaderboard in `components/dashboard.tsx`). Touch targets ≥ ~44px, ≥ 8px apart; no
  hover-only affordances (phones have no hover); tabular figures for numeric columns.
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

## Settings IA — frozen rules (don't move things again)

The three sections (Allowance / KPI / Staff) and their per-section settings pages
are intentionally stable. When a "where should X go?" question comes up, resolve it with the
rule below rather than relocating UI:

- **Staff entities live under Staff (titled “Workforce” in the UI — it holds full-time
  AND freelance people; the directory's create button is “Add member”); system
  administration lives under System Setting.**
  The staff directory and Centers (`/staff/settings`) stay under Staff. **Users / accounts
  (`/system/users`), Audit log (`/system/audit`), and the Permissions matrix
  (`/system/permissions` — role capabilities, role-default launcher categories, AND per-user
  category overrides, all on one page) live under the System Setting section** (`/system/*`).
  Audit log and Permissions are gated to `role === "super_admin"`; **Users is gated on the
  `manage_users` capability** (hierarchy-scoped — see Auth) and is the one System surface a
  non-super-admin can hold. The old
  `/staff/users` · `/staff/audit` · `/staff/permissions` paths 301-redirect (`next.config.ts`),
  and `/system/categories` (the retired Category Visibility page) 301s to `/system/permissions`.
- **Calculator math lives under its calculator.** Allowance tiers + rate tables
  (`/allowance/settings`), KPI metrics + weights + min/max (`/kpi/settings`).
- **All three section tabs are labeled "Settings"** — Allowance, KPI, and Staff — never
  "Options". Section nav is `components/section-nav.tsx`.
- **Cross-page writes are guarded server-side.** Centers are stored in
  `allowanceConfig.centers` but edited via Staff; the dedicated `saveCenters` /
  `saveAllowanceRates` helpers in `lib/db/queries.ts` keep the two pages from
  clobbering each other (locked by `lib/allowance/queries.test.ts`).

## Divergences from the original plan

- **Next.js 16** (plan said 15) → the gate is `proxy.ts`, not `middleware.ts`.
- **In-repo Tailwind components** (`components/ui.tsx`), not **shadcn/ui**.
- **PGlite** local fallback was added so the app runs with no cloud DB (not in the original plan).
- The **scoring-curve redesign** (continuous floor, capped growth) was **not** implemented; defaults
  stay byte-for-byte v11.1. What landed beyond v11.1: the configurable metric registry, a
  **lower-is-better** mode, and the two opt-in metrics above.

## Deploy

Import to Vercel → add Postgres (Neon, **ap-southeast-1**; functions pinned to `sin1`
via `vercel.json`) → set `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` / `SESSION_SECRET` /
`ANTHROPIC_API_KEY` → deploy. **Migrations auto-apply on first DB connect** (`lib/db/index.ts`), so
a fresh prod database needs no manual SQL; you can still run `npm run db:migrate` against the prod
DB to apply them explicitly ahead of traffic. See `README.md` for step-by-step details.

## gstack (recommended)

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted workflows.
Install it for the best experience:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Skills like /qa, /ship, /review, /investigate, and /browse become available after install.
Use /browse for all web browsing. Use ~/.claude/skills/gstack/... for gstack file paths.

## Vendored skills (`.claude/skills/`)

MIT-licensed skills are committed into the repo so they're available in every Claude
Code on the web session with no network (the container is ephemeral; vendoring beats
bootstrapping for skills that don't need it). The SessionStart hook
(`.claude/hooks/session-start.sh`) bootstraps the ones we can't or shouldn't vendor —
gstack, and the proprietary `frontend-design` skill.

- **karpathy-guidelines** — guardrails against common LLM coding mistakes (simplicity,
  surgical edits, verifiable success criteria).
- **A curated subset of [obra/superpowers](https://github.com/obra/superpowers)** (MIT,
  pinned — see `.claude/skills/_vendor/superpowers-NOTICE.md`): `test-driven-development`,
  `systematic-debugging`, `verification-before-completion`, `requesting-code-review`,
  `receiving-code-review`, `brainstorming`, `writing-plans`. Chosen for a payroll app
  where a logic/rounding bug means wrong pay; the agent-orchestration/meta skills
  (worktrees, parallel agents, etc.) were intentionally left out. These are invoked by
  judgment, not as forced ceremony on trivial changes.
- **ui-ux-pro-max** ([nextlevelbuilder](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill),
  MIT, pinned — see `.claude/skills/_vendor/design-skills-NOTICE.md`) — UI/UX design
  intelligence (styles, palettes, font pairings, UX guidelines) with a small Python
  search/design-system generator over CSV data. Only this one skill from that repo is
  vendored; its sibling "ckm-design" marketing skills and bundled fonts are not.

**Bootstrapped, not vendored:** **frontend-design** (Anthropic's official UI skill) is
proprietary ("© Anthropic PBC. All rights reserved."), so it is *not* committed; the
SessionStart hook installs it from the official source each session and its artifacts
(`.agents/`, `skills-lock.json`, `.claude/skills/frontend-design`) are gitignored.
