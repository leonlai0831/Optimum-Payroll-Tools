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

> **Pending work / next session:** the **live backlog** (in-progress branch + the
> operator decisions behind each item) is in **`HANDOFF.md`**; intent + priorities
> in **`ROADMAP.md`**. Those move per session — check them for current status
> rather than enumerating it here (this file records the **stable** system).

## Table of contents

- **Start here:** [Non-negotiable rules](#non-negotiable-rules-read-first) · [Communicating with the operator](#communicating-with-the-operator) · [Development SOP](#development-sop--per-feature-loop-follow-every-session) · [Doc-maintenance policy](#doc-maintenance-policy-do-not-update-all-three-files-every-time)
- **Product / engine:** [Goal & decisions](#goal--decisions) · [Tech stack](#tech-stack-as-built) · [App structure](#app-structure) · [KPI scoring engine](#kpi-scoring-engine-libkpi) · [Name merge](#name-merge)
- **Modules:** [Student Progress](#student-progress-progress-libingest) · [Freelancer Payment](#freelancer-payment-libfreelancer-freelancer) · [Lesson Plan](#lesson-plan-liblesson-plan-lesson-plans) · [Clock-in / Timesheet](#clock-in--timesheet-libtimesheet-timesheets)
- **Platform:** [Design language](#design-language-since-the-2026-06-redesign) · [Data model](#data-model-drizzle--postgres) · [Auth](#auth) · [AI](#ai-libaianthropicts) · [Error tracking & logs](#error-tracking--logs) · [Attention badges](#attention-badges-launcher-cards--section-nav-tabs) · [Environment variables](#environment-variables) · [Commands](#commands)
- **Rules & history:** [Conventions & gotchas](#conventions--gotchas) · [Settings IA — frozen rules](#settings-ia--frozen-rules-dont-move-things-again) · [Divergences](#divergences-from-the-original-plan) · [Deploy](#deploy) · [gstack](#gstack-recommended) · [Vendored skills](#vendored-skills-claudeskills)
- **Companion docs:** `HANDOFF.md` (session backlog) · `ROADMAP.md` (intent) · `docs/design-notes.md` (visual/animation narrative) · `docs/DECISIONS.md` (settled decisions + divergences)

## Non-negotiable rules (read first)

The rules most likely to bite if missed; each points to its full section below.

1. **Reply to the operator in Chinese; keep every artifact in English** — code,
   identifiers, commits, PR text, code comments, and the docs. → *Communicating with the operator*
2. **Mobile-first, no side-scroll tables.** Every data view ships `MobileCards`
   (phone) + `DesktopTable` (`lg+`); touch targets ≥ ~44px, no hover-only
   affordances. → *Conventions & gotchas*
3. **Payroll logic is pure + Vitest-locked.** Anything computing pay / hours /
   scores lives in `lib/**` (no DB/HTTP) with a test — a rounding or merge bug is
   wrong pay. → *KPI engine, Freelancer, Clock-in, Conventions*
4. **Dates only via `formatDate` / `formatDateTime`** (`lib/utils.ts`), never bare
   `toLocale*` — server/client locale drift breaks hydration. → *Conventions & gotchas*
5. **Read-then-write DB sequences must be atomic** — go through the advisory-lock /
   `onConflict` helpers in `lib/db/queries.ts`, never a separate check + write. → *Conventions & gotchas*
6. **This is Next 16:** middleware is **`proxy.ts`**, not `middleware.ts`; read
   `node_modules/next/dist/docs/` before using a Next API (per `AGENTS.md`). → *Conventions & gotchas*
7. **KPI defaults reproduce v11.1 byte-for-byte** — don't touch the scoring curve;
   it's locked by `lib/kpi/calc.test.ts`. → *KPI scoring engine*
8. **Removable list rows reconcile by a stable `_key`, never array index** (index
   keys shift focus onto a neighbour). → *Conventions & gotchas*
9. **Per-feature SOP, one clean PR at a time:** `/code-review` + lint + typecheck +
   test + build → **mandatory gstack browser QA for any UI change** → auto-merge
   only when CI green **and** QA passed. → *Development SOP*
10. **Settings IA is frozen** — resolve "where should X go?" with the rules; don't
    relocate UI. → *Settings IA — frozen rules*

## Communicating with the operator

**Reply to the operator in Chinese (中文).** Standing instruction (2026-06-14): all
chat explanations / status updates to the operator are written in Chinese. The
artifacts stay in **English** — code, identifiers, commit messages, PR titles/bodies,
code comments, and the project docs (`CLAUDE.md` / `ROADMAP.md` / `HANDOFF.md`).

## Development SOP — per-feature loop (follow EVERY session)

Standing operator instruction (2026-06-13): when working through the backlog, run
this loop **per feature** and **do not stop until every queued task is done** — or
until the conversation's token budget runs low (step 4). Keep the existing **one
clean PR at a time** rule; each pass through the loop is one PR.

1. **Build → review → test → QA.** Implement ONE feature on its branch, then review
   and test it before doing anything else: run the `/code-review` skill on the diff
   and address its findings, plus `npm run lint`, `npm run typecheck`, `npm test`,
   and `npm run build`. A red check means it is NOT done — fix it, don't move on.
   **gstack browser QA is MANDATORY (operator instruction 2026-06-14), not
   "when it warrants" — every PR that touches a user-facing surface** (any
   page / component / style / client interaction) **must be driven in a real
   browser via gstack BEFORE the PR is merged** — log in, exercise the new flow on
   a phone-width viewport, and confirm it behaves. The ONLY changes that may skip it
   are ones with literally no rendered surface (pure `lib/**` logic, DB queries,
   types, docs); when you skip, say so and why. A red/failed QA blocks the merge
   exactly like a red test. (See "Environment notes" in `HANDOFF.md` for the gstack
   Playwright-bridge recipe in Claude Code on the web.) **Doc edits ride in THIS
   PR** per the doc-maintenance policy below: if the feature changed a system
   fact/rule, update `CLAUDE.md` here; if it cleared a roadmap item or changed
   direction, update `ROADMAP.md` here. (Do NOT touch `HANDOFF.md` per-feature —
   that's session-end.)
2. **Auto-merge when clean.** Once review + tests pass, **the mandatory gstack QA
   has passed** (step 1), **and CI is green on the PR**, merge it — this is standing
   authorization, no need to ask per-PR. Never merge a red or still-pending PR, or
   one whose UI hasn't been browser-QA'd: confirm CI green + QA done first (merging
   here bypasses branch protection, so those checks are the real gate).
3. **Check the token budget, then continue or hand off.** If there is comfortably
   enough conversation budget left for another full build→review→merge cycle, cut a
   fresh branch from the updated `main` and loop back to step 1 with the next
   backlog item. If not, **refresh `HANDOFF.md` (session snapshot — see below) and
   stop, telling the operator to open a new conversation** so the next session
   resumes cleanly.

Repeat steps 1–3 until the backlog is empty or step 3 pauses for budget. Hard /
irreversible / outward-facing actions outside this loop still get confirmed first;
the per-PR auto-merge above is the one standing exception.

### Doc-maintenance policy (do NOT update all three files every time)

Three docs, three cadences. Per feature, run the two-question self-check; `HANDOFF`
waits for session end.

- **`CLAUDE.md` (system facts / rules)** — update only when "what the system looks
  like" or a hard rule changes, **in the same PR as the code**. Update for: a new
  module, a data-model / migration change, a changed convention or calculation rule,
  a new capability, a newly-frozen decision. Do NOT touch for: a bug fix, copy
  change, style tweak, or behavior-preserving refactor.
- **`ROADMAP.md` (intent / direction)** — update only when intent, priority, or a
  decision changes. Update for: a roadmap item shipped (mark ✅ / remove it), a
  priority re-order, a new owner decision (into "Decided — do not reopen"). Do NOT
  record pure implementation detail here (that belongs in HANDOFF).
- **`HANDOFF.md` (session handoff snapshot)** — refresh **per session, not per
  feature**, once at session end / handoff: what this session did + which PRs
  merged, the real backlog state (cross off done, add new), and any pitfalls /
  environment notes the next session needs.

**Per-feature self-check:** ① Did it change a system fact or rule? → yes ⇒ edit
`CLAUDE.md` (in the feature PR). ② Did it clear a roadmap item or change direction?
→ yes ⇒ edit `ROADMAP.md` (in the feature PR). Otherwise leave them untouched.
`HANDOFF.md` is updated at session end regardless.

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
  types.ts utils.ts              # shared types; rm() ringgit, formatDate/formatDateTime, cn()
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
`DEFAULT_CENTER_TARGETS` (e.g. HQ/Berkeley 450, Puchong Kinrara & Subang USJ 750; fallback 140);
`getCenterTarget` matches a CSV center name to a configured key by token overlap in **either
direction** ("Kinrara" resolves to "Puchong Kinrara"), and when several keys match the closest
wins deterministically — most shared tokens, then fewest unmatched tokens, then alphabetical —
so a config edit can't silently flip a supervisor's target.

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
  per-IP rate limit, ~2 MB cap) accepts a **JSON object** (REST-standard, everything in the
  body): `{ periodLabel: "YYYY-MM", label?, rows }` OR `{ periodLabel, label?, csv }` where
  `csv` is the raw CSV text as a string field (parsed via `lib/ingest/csv-body.ts`) — both use
  the **same flexible headers as the CSV upload** (normalized via `mapCsvRows`). It still also
  accepts a **raw CSV body** (`Content-Type: text/csv`; `periodLabel` required + `label` optional
  as query params) for file-streaming senders, but the JSON `csv` field is preferred (no query
  params). The proxy exempts `/api/ingest` from the cookie redirect (bearer auth happens in the route).
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
reopen the run to push a correction). The closed-check and the staging insert run in **one
transaction under a per-period advisory lock** (`createKpiIngestChecked` in
`lib/db/queries.ts`), and every closing path — finalizing `createRun`/`updateRunReview`,
`importKpiIngest` — takes the same lock, so a concurrent finalize can't race a stray pending
delivery into a just-closed month. Owners (`run_kpi`) review on `/progress` (deliveries
grouped by month, newest first, with status + source badges and row counts): edit/add/delete
rows on **any non-superseded delivery** (PATCH `/api/kpi/ingests/[id]`, audited — pending,
imported and discarded records stay correctable; editing an *imported* delivery shows a banner
that the saved KPI run was computed from a snapshot and is NOT changed by these edits;
superseded is read-only), discard (status flip, pending-only), or "Load into calculator" →
`/kpi?ingest=<id>` seeds the dashboard with the staged rows (pending-only; same merge →
compute → save flow; filename shows the ingest label). Saving threads `ingestId` through
`POST /api/runs`, which marks the ingest `imported` + links `importedRunId`.

**Auto-compute → draft KPI run (pending-only, `run_kpi`).** Next to "Load into
calculator", **"Compute KPI draft"** (`POST /api/kpi/ingests/[id]/compute`) does the
merge + v11.1 scoring **server-side** and creates a run in one click, then jumps to its
review screen — the server-side equivalent of load → save, without the manual step. The
engine is the pure, Vitest-locked `buildRunCoaches` (`lib/kpi/build-run.ts`): faithful to
the dashboard (deterministic + known-alias + best-effort AI merge; the classifier's
`defaultInclude` picks scoring accounts; center = most-common; only allowance-AND-teaching
groups appear, ranked by finalScore). **Teaching allowance comes from the WORK month's saved
Allowance run** (`listAllowanceRuns(period)`, linked per coach via `linkAllowance` — id →
exact → normalized name → alias, exactly like the dashboard; the operator always keys
allowance before KPI, so no manual allowance editor), falling back to the profile's
carry-over only when nothing links; management assessment carries over from the profile,
overlaid by the latest assessment %. It is **always saved `status:"draft"`** — the name merge
is payroll-critical and management assessment / supervisor group hours aren't in the CSV — so a
manager reviews + finalizes (`finalize_kpi`) on the `RunReview` screen. `RunReview` edits the
management assessment, the account merge, **the Position (Instructor / Pool Supervisor) and a
supervisor's group center + hours (/40)** — the supervision hours are entered by hand because
allowance + clock-in only track *teaching* hours (a supervisor's actual hours are longer).
Persists exactly like the dashboard save (`createRun` + `importKpiIngest`, same per-period
advisory lock + closed-month guards); a 409 returns the existing draft's `runId` to redirect
to. **Compute is NEVER automatic on upload/push (operator decision 2026-06-13):** a delivery
is only STAGED, the owner reviews + edits the month's database (add/delete rows) on
`/progress`, and only the explicit "Compute KPI draft" (which saves pending edits first) sends
it to the KPI module — so an unreviewed month can never become a run.

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
0 for A1–A3; order-independent — the largest threshold ≤ value wins even if an
operator reorders the rows on `/freelancer/settings`); **attendance bonus**
(default +0.2, fixed hours only) unless ANY
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
back onto the coach profile; blank payee fields never wipe stored values.
Because the upsert never errors on a duplicate, the calculator looks up the
payout month before submitting and **asks first** (`classifySaveCollision` in
`lib/freelancer/collision.ts`, locked by `collision.test.ts`, + `ConfirmModal`):
same person + position family + work month → "saving replaces that record";
same person but different family/work month → "saving adds a second record";
an edit whose family/work month changed warns that it lands on ANOTHER record
(or creates a new one) while the opened record stays. Pages:
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
run, falling back to the latest pending ingest, summed per RAW instructor
account — **no `getCleanName` merging** (operator decision 2026-06-12): branch
accounts like `CK [BK]` / `CK [PK]` stay separate so the binding targets the
branch actually taught at).
The binding carries over via the latest run; counts stay editable; month P's
data arrives on the 1st of P+1 (the UI says so when empty). **CC bonus
semantics (operator-confirmed 2026-06-12, validated against the real May
batch)**: hours-based commitment applies via the 0-result column (like
PA/T0), no student result, attendance applies. Locked by `calc.test.ts`
with the May numbers — don't flip it again without a paid example.

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

## Clock-in / Timesheet (`lib/timesheet`, `/timesheets`)

Staff self-report their monthly hours → an admin approves → approved hours feed
the pay calculators. Launcher card "Clock-in" (swim); section tabs **My
timesheet** (`/timesheets`, `submit_timesheet`) · **Review** (`/timesheets/review`,
`review_timesheet`) · **Schedules** (`/timesheets/schedules`,
`manage_freelancer_schedule`). Built P1→P4 (2026-06-13); the engine is pure +
Vitest-locked like the freelancer/allowance engines (payroll).

- **Pure core** (`lib/timesheet/`): 7 clock-in **class types**
  (Low/Medium/High/Adult/Young Swimmer/Precomp/Lifesaving) fold into the 3
  allowance rate buckets via `teachingBucketOf` (low/med/high/adult→`normal`,
  youngSwimmer→`youngSwimmer`, precomp/lifesaving→`precompLifesaving`) — **no
  rate-table change**. `aggregateTeaching` (full-time `lesson` hours → allowance
  `teachingRows`); `reconcileFreelancer` (a freelancer's approved clock-ins vs
  their fixed schedule → fixed / replaced / absence → `FreelancerCenterRow[]`,
  auto-deriving the attendance-bonus forfeit). **Reconcile matches on the
  scheduled DATE only** (operator: freelancers cover at other centers, so a
  clock-in on a scheduled day is fixed wherever it happened; hours land on the
  center actually worked; the schedule carries no class type — declared at
  clock-in).
- **Two entry modes, auto-locked by `coaches.jobRole`** (no Lesson/Shift toggle):
  `jobRole === "front_desk"` → **shift** (start/end → hours; no class type),
  everyone else → **lesson**. The page reads the linked coach's role
  (`getCoach(user.coachId)`) and passes a fixed `entryMode` to
  `components/timesheet-entry.tsx`; defaults to lesson when there's no profile.
  A **lesson is a SESSION**: a clocked start–end window holding **one or more
  `(classType, hours)` lines** (a multi-line editor with a live "sum vs span"
  gate). The lines' hours must total the window within **±0.25 h**
  (`SESSION_HOURS_TOLERANCE`) or both the form and the server reject it; the
  session **persists as one lesson row per line** sharing the window
  (`sessionToEntries` → N × `createTimesheetEntry`), so aggregation/reconcile
  (which read `entryType` + `classType` + `hours`, never the times) are unchanged.
  `POST /api/timesheets` routes a body with a `lines` array through
  `parseTimesheetSession`; a shift (or legacy single entry) still goes through
  `parseTimesheetEntry`. **One row per class type (operator decision 2026-06-14):**
  the per-line number IS hours (not class count) — each class = 1 h, **Young
  Swimmer = 0.5 h/class** (so 2 Young Swimmer classes = 1 h; 0.5-h input steps);
  the form's type dropdown only offers types not already in the session and "Add
  class" is disabled once all are used, so to log more of a type the coach **raises
  its hours**, not adds a second row, and `parseTimesheetSession` **merges any
  duplicate class types** (summing hours) as the server backstop. v1 covers
  **full-time instructors + all freelancers (incl. freelance front desk)**;
  **full-time front desk is deferred** (still manual). Hours for a `shift` are
  derived server-side from start/end. All parsing is pure + Vitest-locked
  (`lib/timesheet/validate.ts`).
- **The clocked window is ONE record (display + delete + review).** The per-line
  rows are collapsed back into the window the coach filed via the pure,
  Vitest-locked `groupSessionWindows` (`lib/timesheet/group.ts`) — grouping lesson
  rows by `(date, center, start, end)` (a shift, or a legacy window-less lesson,
  stays its own single-row record; the entry list also keys on `status` so a
  half-reviewed window splits). A coach can't be in two identical windows at one
  center at once, so the key is lossless — **no `sessionId` column / migration**
  (operator-chosen tradeoff; the watch-item is two genuinely-distinct same-window
  sessions, which the model doesn't allow). Both the coach's list
  (`timesheet-entry.tsx`) and the reviewer's queue (`timesheet-review.tsx`) show
  the window as one record with its per-class breakdown; the coach's **delete**
  (whole window via `DELETE /api/timesheets` with `{ ids }` → `deleteTimesheetEntries`,
  re-checking each id's own-draft/reviewer permission) and the reviewer's
  **approve / request-changes** act on **every row of the window together** (the
  review checkbox selects all the window's ids; `reviewTimesheets` still flips by
  id, unchanged). Persistence stays one row per class line, so payroll
  aggregation/reconcile are untouched.
- **Schema** (`timesheets` + `freelancer_schedules`): review workflow mirrors
  lesson plans (`draft → submitted → approved / changes_requested`); editing an
  entry resets it to draft; rows never hard-deleted. `slotType` is derived (admin
  can override). Migrations **0033** (tables), **0035** (`note` column),
  **0036** (drop schedule `class_type`).
- **Routes** (`app/api/timesheets/*`, capability-gated, audited): `/` (GET own |
  `?coachId=` for reviewers, POST own, **DELETE `{ ids }` = a whole clocked
  window**), `/[id]` (PATCH/DELETE one), `/submit` (flip
  own month draft→submitted), `/review` (GET queue + POST batch
  approve/request-changes — guarded to `submitted` only), `/aggregate`
  (`mode=allowance|freelancer`, gated `run_allowance`/`run_freelancer`).
- **P4 "Load from clock-in"** buttons in the Freelancer + Allowance calculators
  pull the approved month's hours (freelancer auto-classified via the schedule).
- **Pre-go-live data** (like the freelancer payee import): link each
  instructor/freelancer login to its coach profile (`users.coachId` — else "your
  account isn't linked"), and enter each freelancer's fixed schedule (else their
  clock-ins read as replacements/absences). The **Users page AI auto-link**
  (below) does the first; `/timesheets/schedules` the second.

## Design language (since the 2026-06 redesign)

Notion-calm base × Optimum CI: warm paper canvas `#f6f5f4`, **remapped warm-grey
`gray-*` tokens (don't re-introduce cool greys)**, hairline borders + the layered
`.shadow-card` micro-shadow, Nunito 800 headings with negative tracking, **pill**
primary/secondary/danger buttons vs 8px outline/ghost utility chrome, form fields
`text-base` at phone widths (iOS anti-zoom). Brand skins come from `data-brand`
CSS variables. **Every data view ships BOTH layouts** — `MobileCards` on phones /
`DesktopTable` on `lg+`, never a side-scroll table (see the mobile-first rule in
Conventions). A decorative rig (the CI footer wave `components/ci-wave.tsx`, the
lg+-only racing-stripe band, the login/hero mascot, and the click toys) sits on
the login + launcher.

> **Full design narrative** — the racing-stripe system, login interactivity
> (mascot rig, charging glints, click toys), and the launcher ribbon geometry —
> moved to **`docs/design-notes.md`** (2026-06-14, to keep this file focused).
> Edit there when touching that chrome.

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
gates everything else. Clock-in adds three capabilities — `submit_timesheet`
(staff+supervisor+admin), `review_timesheet` + `manage_freelancer_schedule`
(supervisor+admin), with `BACKFILL_CAPS` so existing deployments inherit them per
role default (no SQL for the matrix). The `users` table carries both a
**`displayName` (the everyday "Nickname")** and an admin-only **`fullName`**
(legal name, migration 0037 — the PATCH route rejects a `fullName` change from a
non-admin). `/system/users` has list search + **sortable columns (incl. Full
Name AND Linked Workforce — the latter sorts by the resolved profile name)** + a
**filter bar** (by Role / Active status / Linked-vs-unlinked); inline edits
(Nickname / Full Name / Role / Linked Workforce / Active — plus **Email, which is
super_admin-only** to change inline, gated again in the PATCH route) are **STAGED
per row and committed together with a Save button** (no auto-save on blur —
`components/user-manager.tsx` keeps per-id drafts, one PATCH per dirty row; the
password reset stays an immediate one-off). It also has a searchable
linked-employee picker (`components/employee-combobox.tsx` — its dropdown is wider
than the column and shows each coach's **full name + center sub-label**, so similar
"MUHAMMAD …" names stay distinguishable; a profile **already linked to another
account is greyed + locked** with that account's email shown, an up-front guide on
top of the server's one-profile↔one-login 409), **AI auto-link**
(`POST /api/users/auto-link`, reversible + audited) and **bulk add**. Auto-link is
**precision-first** (`lib/users/autolink.ts`, Vitest-locked — a wrong link decides
who can clock in / be paid): a deterministic pass matches on the **Full Name first,
then the Nickname**, by cleaned-name equality → same token-set (any order) → multi-
token subset, and links a user only when **exactly one** coach reaches that top tier
(ambiguous ties are skipped); each coach is used once. A conservative Claude pass
(`matchUsersToCoaches`, fed the full name) handles the remainder, then every AI match
is gated by `sharesNameSignal` (must share a real name token — kills hallucinated
links for signal-less accounts like a phone-number email). **One workforce profile ↔
one login is enforced at three layers:** auto-link skips coaches already linked to any
account; the link PATCH (`/api/users/[id]`) 409s if a coach/gym-staff record is already
linked elsewhere; and a **partial UNIQUE index on `users.coach_id` AND `users.gym_staff_id`
(WHERE NOT NULL, migration 0038)** is the DB backstop. 0038 first **auto-dedups** any
historical duplicates (keeps the **ACTIVE** login per profile, else the earliest — never
orphans the live operator for a stale account — NULLs the rest, audited as
`user.dedup_links`) so it's safe to auto-apply on a cold start; re-run-safe (idempotent).
And **bulk add** (`POST /api/users/bulk` — **upload a CSV or Excel
file**: an `email` column + an optional `full name` (→ the **Full Name** field,
not the Nickname), parsed client-side into rows by the Vitest-locked
`lib/users/bulk-parse.ts` — CSV via PapaParse, Excel via lazy ExcelJS, flexible
header detection or headerless `email,name`; one role + shared initial password).
**When the upload overlaps existing emails the operator is asked: Overwrite or
Skip** (a dialog on Create; no prompt when there are no collisions). The
overwrite/skip decision is the pure, Vitest-locked `planBulkUsers`
(`lib/users/bulk-plan.ts`): in-file dups are skipped (first wins); **overwrite**
resets the existing account's role + shared password (+ full name when the row
has one) but **never the actor's own account and only accounts the actor
outranks** (hierarchy scope, server-authoritative via `listUsers` so a
hierarchy-hidden higher-ranked account falls through to a safe skip); **skip**
(the default) leaves existing accounts untouched. Overwrites are audited
`user.bulk_update` (creates stay `user.bulk_create`). Launcher **category
visibility** (swim / fit / marketing) lives in the
same permissions matrix: each role has **default categories**, and the page's "User overrides"
tab can pin a per-user list (`users.visibleCategories`; NULL = inherit the role default).
`getCurrentUser()` resolves the effective list (override ?? role default; super_admin always
all) into `CurrentUser.visibleCategories`, enforced on the launcher AND in the brand-section
layouts. The old `/system/categories` page 301-redirects to `/system/permissions`.

**Center-scoped approvals (`users.managedCenters`, migration 0039).** An admin / supervisor can be
restricted to **review, approve, and finalize only for the center(s) they manage** (jsonb `string[] |
null`; **NULL/empty = all centers** = the historical behavior; **super_admin always all**). It mirrors
`visibleCategories`: assigned per-user on the **`/system/permissions` "User overrides" tab** (a second
"Center scope" card under the category overrides — `components/center-overrides.tsx`, listing only
accounts whose role can review/finalize), written via `PATCH /api/users/[id]` with the `managedCenters`
field **gated super_admin-only** (like categories) even though that route is otherwise `manage_users`.
The write is validated + **canonicalized against `AllowanceConfig.centers`** (`sanitizeManagedCenters`),
and **selecting every configured center collapses to NULL** (= unrestricted). `getCurrentUser()` resolves
`CurrentUser.managedCenters` via `effectiveManagedCenters` (super_admin → null). Enforcement (centers
already exist on every entity): the **timesheet review** queue + count + batch-approve
(`listTimesheetsForReview`/`countTimesheetsForReview`/`reviewTimesheets` take a `centers` filter; the
`/timesheets/review` page + API both pass it) and **lesson-plan review** list + single-review
(`listLessonPlans` centers filter on the reviewer view; the `[id]/review` route guards on
`canManageCenter(user.managedCenters, plan.center)`). Matching is exact on the configured center value
for the SQL filters (entries pick from the configured/`CENTERS` list) and trimmed/case-insensitive in
the pure `canManageCenter`. **KPI is the exception — a KPI month is one company-wide run, so a
center-restricted admin can't review / finalize / reopen / delete it at all** (`companyKpiDenied` in
`app/api/runs/[id]`; reserved for super_admin + all-centers admins). Helpers
(`sanitizeManagedCenters` / `effectiveManagedCenters` / `canManageCenter`) are pure + Vitest-locked in
`lib/auth/auth.test.ts`; the queue filters in `lib/timesheet/queries.test.ts`.

**User management is hierarchy-scoped** (`ROLE_RANK` + `canViewUserRole` / `canManageUserRole`
in `lib/auth/types.ts`): a `manage_users` holder manages only accounts ranked **strictly below**
their own role, sees same-rank accounts **read-only** ("View only" rows; 403 on write), and never
sees higher-ranked accounts at all (lists filter them; direct API access 404s so existence doesn't
leak). Creating and role-assignment are limited to roles below the actor's own. super_admin is
all-access, incl. over fellow super_admins (last-active-super-admin safeguards still apply).
`/system/users` (page, layout, section-nav tab) is gated on `manage_users`, not
`super_admin` — the other System pages (Audit log, Errors, Permissions) stay super_admin-only.
The **launcher** shows a **single "System Setting" card** (`href:/system/users`,
`cap:manage_users`, brand `system`) for the whole section — the section nav then exposes
Users / Audit log / Errors / Permissions as tabs (the super_admin-only ones hidden for a
non-super-admin `manage_users` holder, who lands on Users).

**Account self-service (`/account`, any logged-in role).** `components/account-form.tsx`
+ `PATCH /api/users/me` let a user edit **their own Nickname, sign-in Email, and
password** — never their **Full Name or Role** (those stay admin-controlled; Role is
shown read-only). Email/password changes require re-entering the **current password**
(stolen-cookie defense); a Nickname-only change does not. **Changing the email requires
re-typing it in a "Confirm new email" field** (a typo would lock you out — login is
email-keyed, no recovery flow). Linked in the nav for everyone. (The super_admin inline
email edit on `/system/users` gets the same guard via a **confirm dialog on Save** when a
staged change rewrites a sign-in email.)

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
  **absent**. Public paths: `/login`, `/api/auth/*`, `/api/errors`. (Matcher excludes `_next/static`, images, favicon.)
- **Authoritative** checks: the `(app)` layout and `getCurrentUser()`/`requireCapability()` in API
  routes re-validate the iron-session against the DB — a present-but-invalid cookie or a
  deactivated account still gets a JSON `401`/`403`.
- **Idle auto-logout (10 min)** — policy in `lib/auth/idle.ts` (unit-tested). The session carries
  `lastSeenAt` (set at login, refreshed by `POST /api/auth/touch`); `getCurrentUser()` treats a
  session past `IDLE_TIMEOUT_MS + IDLE_SERVER_GRACE_MS` (or one without the field) as signed out.
  `components/idle-logout.tsx` (mounted in the `(app)` layout) pings the touch route on real
  activity (throttled to 1/min) and performs the visible logout after 10 idle minutes — asking
  `GET /api/auth/touch` first so an active sibling tab postpones it instead of being killed.
  Remember-last-email on the login page is deliberately NOT implemented (operator decision
  2026-06-12 — shared front-desk devices must not leak who signed in).
- `/api/auth/login` checks the `users` table (in-process rate-limit per IP+email; session is
  destroyed and re-issued on login). `SESSION_SECRET` (≥ 32 chars) encrypts the cookie; in
  **production a missing/short secret fails fast at request time** (`resolveSessionPassword`
  in `lib/auth/session.ts` throws — no silent fallback to a known string; the `next build`
  phase is exempt so builds succeed without the env var, and dev/test keep a clearly-named
  insecure fallback).
- First boot seeds a super admin from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`
  (dev fallback `admin@local` / `swim123`).

## AI (`lib/ai/anthropic.ts`)

`claude-sonnet-4-6` with prompt caching on the system prompt. **Both calls degrade gracefully**
without `ANTHROPIC_API_KEY`: `matchInstructorNames` → `[]` (deterministic merge still applies),
`analyzePerformance` → a template naming the strongest/weakest metric.

## Error tracking & logs

`lib/log.ts` is a zero-dependency JSON-lines logger (honors `LOG_LEVEL`). Every error-level
log — plus Next's `onRequestError` (`instrumentation.ts`) — flows through the sink registered
by `lib/observability.ts` into TWO places: the **in-app error log** (`app_errors` table, always
on) and **Sentry** (only when `SENTRY_DSN` is set; graceful no-op otherwise). Browser errors
(uncaught exceptions + unhandled rejections) are captured by `components/error-reporter.tsx`
(root layout, login page included) and posted to `POST /api/errors` — proxy-exempt so the
login page can report, defended by an in-process per-IP rate limit + hard field caps, with
per-page-load dedupe on the client. `/system/errors` (super_admin) lists captured errors
(source badge, path, reporter, collapsible stack) with an audited "Clear all"; rows older than
30 days trim opportunistically on insert. `recordAppError` MUST stay silent on failure — it
runs inside the error sink, so logging its own failure at error level would recurse.

**Route error boundaries** (`app/error.tsx` + `app/global-error.tsx`): a render crash shows a
friendly retry page instead of a white screen and **self-reports to `POST /api/errors`** — this
fills a real gap, since React render errors are swallowed into the boundary and never reach the
`window.onerror` listener in `error-reporter.tsx`. `global-error.tsx` replaces the root layout, so
it ships its own `<html>/<body>` + inline styles. **Unseen-error badge:** the launcher **System
Setting** card shows a red count of `countAppErrors()` for a super_admin (the only role that can
open the Errors tab); it clears to 0 on "Clear all". This is one source of the shared
**attention-badge system** (`lib/nav/badges.ts`, below).

### Attention badges (launcher cards + section-nav tabs)

One source of truth (`attentionBadges(user, caps)` in `lib/nav/badges.ts`) feeds a red
"phone-notification" count to BOTH the launcher card (on the icon's top-right corner) AND the
matching tab inside the section, via the shared `components/count-badge.tsx`. Keyed by the
DESTINATION href: **System → Errors** (`countAppErrors`, super_admin), **Clock-in → Review**
(`countTimesheetsForReview`, `review_timesheet`), **Lesson Plan → History**
(`countLessonPlansForReview`, `review_lesson_plans`). Each source is capability-gated for the
current user (super_admin's `getCapabilities` holds all caps, so it sees them all; errors are
super_admin-only) and **best-effort** — a failing count degrades to 0 and never takes down the
nav or launcher; non-reviewers run **zero** count queries (the gates short-circuit). The launcher
rolls a card's count up from its section's destinations (`launcherBadgeCount` +
`LAUNCHER_BADGE_HREFS`, Vitest-locked); `SectionNav` takes an optional `badges` prop and the
system/timesheets/lesson layouts pass it. The **Clock-in → Review** and **Lesson Plan → History**
counts are **center-filtered** for a center-scoped reviewer (`user.managedCenters` threaded into
`countTimesheetsForReview`/`countLessonPlansForReview`), so a badge matches the scoped queue the
reviewer actually sees (see "Center-scoped approvals" under Auth).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | yes (prod, first boot) | Seeds the first super-admin account (dev falls back to `admin@local` / `swim123`). |
| `SESSION_SECRET` | yes | ≥ 32 random chars; encrypts the session cookie. Production refuses to serve requests without it (dev/test fall back). |
| `POSTGRES_URL` (or `DATABASE_URL`) | yes (prod) | Postgres connection string. Unset → PGlite at `./.pglite`. |
| `ANTHROPIC_API_KEY` | optional | Enables AI name-merging + analysis. |
| `INGEST_API_KEY` | optional | Bearer key for the machine KPI push endpoint (`POST /api/ingest/kpi`). Unset → the endpoint answers 503. |
| `SENTRY_DSN` | optional | Forwards captured errors to Sentry on top of the always-on in-app error log (`/system/errors`). |

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
- **Date labels must use `formatDate`/`formatDateTime`** (`lib/utils.ts` — fixed `en-MY` locale +
  `Asia/Kuala_Lumpur`), never bare `toLocaleDateString()`/`toLocaleString()`: server and client
  locales differ, which breaks hydration.
- **Removable list rows reconcile by a stable client-only key** (a `_key` field stripped before
  persist), never by array index — index keys shift a focused input onto the neighbour when a
  middle row is removed (see commission bands, freelancer center rows/extras, lesson-plan steps).
- **Read-then-write DB sequences must be atomic.** Anything that checks state before writing
  (period close/lock checks, coach auto-create) goes through the advisory-lock/transaction
  helpers in `lib/db/queries.ts` (`createKpiIngestChecked`, `createAllowanceRunIfUnlocked`,
  `moveAllowancePeriod`) or an `onConflict` upsert — separate check + insert transactions race.
- **Link-styled buttons use `ButtonLink`/`buttonClasses`** (`components/ui.tsx`) — never nest a
  `<button>` inside an `<a>` (invalid HTML).

## Settings IA — frozen rules (don't move things again)

The three sections (Allowance / KPI / Staff) and their per-section settings pages
are intentionally stable. When a "where should X go?" question comes up, resolve it with the
rule below rather than relocating UI:

- **Staff entities live under Staff (titled “Workforce” in the UI — it holds full-time
  AND freelance people; the directory's create button is “Add member”); system
  administration lives under System Setting.**
  The staff directory and Centers (`/staff/settings`) stay under Staff. **Users / accounts
  (`/system/users`), Audit log (`/system/audit`), Errors (`/system/errors`), and the Permissions
  matrix (`/system/permissions` — role capabilities, role-default launcher categories, AND
  per-user category overrides, all on one page) live under the System Setting section**
  (`/system/*`). Audit log, Errors and Permissions are gated to `role === "super_admin"`;
  **Users is gated on the `manage_users` capability** (hierarchy-scoped — see Auth) and is the
  one System surface a non-super-admin can hold. The old
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

Moved to **`docs/DECISIONS.md`** (2026-06-14) — the home for settled history +
frozen decisions, so dated rationale doesn't accrete as noise here. The headline
divergences (Next 16 → `proxy.ts` not `middleware.ts`; in-repo `components/ui.tsx`
not shadcn/ui; PGlite local fallback; the v11.1 scoring curve kept byte-for-byte
rather than the proposed redesign) live there.

## Deploy

Import to Vercel → add Postgres (Neon, **ap-southeast-1**; functions pinned to `sin1`
via `vercel.json`) → set `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` / `SESSION_SECRET` /
`ANTHROPIC_API_KEY` → deploy. **Migrations auto-apply on first DB connect** (`lib/db/index.ts`), so
a fresh prod database needs no manual SQL; you can still run `npm run db:migrate` against the prod
DB to apply them explicitly ahead of traffic. See `README.md` for step-by-step details.

**Migration robustness (`lib/db/index.ts`, hardened 2026-06-13).** Three layers
keep auto-migrate from wedging serverless startup: (1) a **transient-failure
retry** — `migrate()`'s first statement (`CREATE SCHEMA "drizzle"`) / the journal
insert can fail either from a **concurrent race** (two cold-start instances:
`23505`/`XX000`/etc.) OR a **cold-start connection storm** (the compute waking
`57P03`, the connection limit `53300`, a dropped socket `ECONNRESET`/
`CONNECT_TIMEOUT`/etc. — `isTransientConnectionError`); both are transient and
`migrate()` is idempotent, so both are retried with backoff. Permanent misconfig
(bad host/`ENOTFOUND`, auth `28P01`, privilege `42501`) matches neither set and
surfaces immediately. (2) `reconcileSchema` (the fallback when the journal is out
of sync — e.g. a `db:push`-bootstrapped prod DB) replays every migration
statement-by-statement, **skipping both "already exists" AND "already gone"**
SQLSTATEs, so `DROP COLUMN`/`ALTER` replays are no-ops (write new DROP migrations
as `DROP COLUMN IF EXISTS`). (3) After a reconcile, `recordMigrationsAsApplied`
**backfills `drizzle.__drizzle_migrations`** (drizzle's own hash + folderMillis)
so the NEXT migrate is a clean no-op — no perpetual per-cold-start reconcile.
Locked by `lib/db/migrate-repair.test.ts`. **The error log captures the `cause`
chain** (`serializeError` in `lib/observability.ts`): the Postgres SQLSTATE lives
on `err.cause` (drizzle wraps the driver error), so the stored stack appends
`Caused by: [code: …]` — otherwise a DB error reads as an opaque `Failed query: …`
wrapper. (For serverless connection storms the real fix is the **pooled** Postgres
endpoint — Neon `-pooler` — so set `POSTGRES_URL` to it.)

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
gstack, the proprietary `frontend-design` skill, and the `pm-skills` plugin
marketplace.

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
- **skill-creator** ([anthropics/skills](https://github.com/anthropics/skills),
  Apache-2.0, pinned — see `.claude/skills/_vendor/skill-creator-NOTICE.md`) —
  Anthropic's official skill-authoring skill: scaffold new skills, edit/optimize
  existing ones, and run evals to benchmark triggering + performance. Permissive
  license, so vendored (committed) like the two above rather than bootstrapped.
- **find-skills** ([vercel-labs/skills](https://github.com/vercel-labs/skills),
  MIT, pinned — see `.claude/skills/_vendor/find-skills-NOTICE.md`) — the
  discovery skill for the open agent-skills ecosystem: searches/installs skills
  via the `npx skills` CLI (`skills find` / `skills add`) and the skills.sh
  leaderboard. MIT, so vendored like the others.

**Bootstrapped, not vendored:** **frontend-design** (Anthropic's official UI skill) is
proprietary ("© Anthropic PBC. All rights reserved."), so it is *not* committed; the
SessionStart hook installs it from the official source each session and its artifacts
(`.agents/`, `skills-lock.json`, `.claude/skills/frontend-design`) are gitignored.
The hook also adds the **pm-skills** plugin marketplace
([deanpeters/Product-Manager-Skills](https://github.com/deanpeters/Product-Manager-Skills))
and installs its `jobs-to-be-done` plugin — product-management skills (structured
jobs/pains/gains discovery). Plugin installs live at user scope in `~/.claude`,
which the ephemeral container loses, hence per-session bootstrap rather than
vendoring.
