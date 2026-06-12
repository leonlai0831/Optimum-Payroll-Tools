# Session Handoff — Optimum People Hub

Snapshot for the next session (last updated **2026-06-12**, session end).
`main` holds PRs #136–#142 — everything from this session is merged. Full
suite 411 passing. Read `CLAUDE.md` for architecture + the frozen Settings IA
rules; read `AGENTS.md` before touching Next.js APIs.

## What's on `main` now

The suite ("**Optimum People Hub**") is in production on Vercel. Modules:

- **Swim**: Staff Allowance · Freelancer Payment · Instructor KPI Bonus ·
  Student Progress (the monthly data pipeline) · Workforce (directory +
  Payees tab) · Instructor Assessment · Lesson Plan.
- **Fit**: Staff Earnings (commission + coaching income).
- **System**: Users (hierarchy-scoped `manage_users`) · Audit log · Permissions.

### Landed on `main` since the #136 snapshot (PRs #137–#141)

A rename plus a system-wide audit-hardening pass — no new modules, no behavior
changes for correct inputs; the fixes close races and silent-wrong-number paths.

1. **Project renamed to Optimum People Hub** (#137): package name, app
   metadata, README, and the GitHub repo path (`leonlai0831/Optimum-People-Hub`;
   ONBOARDING.md updated). Old "KPI & Bonus Dashboard" name survives only as
   the "formerly" note in CLAUDE.md.
2. **Concurrency races fixed** (#138, all pre-existing on `main`):
   - KPI **period-close race**: closed-check + staging insert now run in ONE
     transaction under a per-period advisory lock (`createKpiIngestChecked`,
     `lib/db/queries.ts`); every closing path (finalizing `createRun` /
     `updateRunReview`, `importKpiIngest`) takes the same lock.
   - `updateRunReview` status flip + coach carry-forward are one transaction.
   - Coach auto-create races resolve via `onConflict` instead of 500ing.
   - `moveAllowancePeriod` is atomic (dual-period advisory locks, lowest key
     first; returns `locked` → route 409).
   - Freelancer **commitment-matrix lookup is order-independent** (largest
     threshold ≤ value wins even if settings rows are reordered) and the
     calculator's KPI-bind fetch race is guarded (request-sequence ref).
3. **Low-severity sweep** (#139): hydration-safe `formatDate`/`formatDateTime`
   in `lib/utils.ts` (fixed en-MY + Asia/Kuala_Lumpur; replaced 26 bare
   `toLocaleString` sites); `ButtonLink`/`buttonClasses` replace
   button-in-anchor; `window.confirm` → `ConfirmModal`; payee bulk save is one
   transaction; 404 existence gates before note/assessment writes; masked
   admin password fields with reveal; stable list keys; misc a11y/memoization.
4. **`getCenterTarget` is deterministic** (#140): center-name → target matching
   keeps both containment directions ("Kinrara" → "Puchong Kinrara", operator
   confirmed), but multiple candidates now resolve closest-first (most shared
   tokens, fewest unmatched, then alphabetical) instead of config insertion
   order — a config edit can no longer silently flip a supervisor's target.
5. **SESSION_SECRET fails fast in production** (#141): missing/short secret
   used to silently fall back to a public built-in string (forgeable cookies).
   `resolveSessionPassword()` now throws at request time in prod; `next build`
   phase is exempt (builds succeed without the env var); dev/test keep the
   clearly-named insecure fallback.

New conventions worth knowing (now in CLAUDE.md "Conventions & gotchas"):
date labels via `formatDate`/`formatDateTime` only; removable list rows keyed
by a client-only `_key`, never array index; read-then-write DB sequences go
through the advisory-lock helpers or `onConflict`.

### This session's work — PR #142 (MERGED 2026-06-12, squash `4bdc2fc`)

Four pieces:

1. **Docs refresh**: CLAUDE.md + HANDOFF.md brought to the post-#141 state.
2. **Freelancer duplicate-save confirm**: the runs table upserts on (period,
   person, position family, work month), so duplicates never errored — they
   silently replaced or silently added a second record. The calculator now
   looks up the payout month before submitting and asks first — same family +
   work month → "replace that record"; different family/work month → "adds a
   second record"; an edit whose key changed warns the opened record stays.
   Pure classifier in `lib/freelancer/collision.ts` (9 tests); server upsert
   unchanged.
3. **Login interactivity** (all eight items Leon picked): password reveal +
   Caps Lock hint + shake/`role="alert"`/vibration on failure +
   `@optimumtrain.page` completion chip (`lib/auth/email-suggest.ts`, 8 tests)
   + stripe-band charging glints while the request is in flight + the mascot
   rig (`components/login-mascot.tsx` — watches email, covers its goggles on
   password, peeks on reveal, cheers on success) + footer-wave mouse parallax
   + a 5-tap logo easter egg (mascot swims the wave). Deliberately NOT
   included: remember-last-email (shared-device privacy — Leon hasn't decided).
4. **e2e fix**: the reveal toggle's aria-label ("Show password") made
   Playwright's substring `getByLabel("Password")` ambiguous (strict-mode
   violation in `e2e/auth.spec.ts` + `e2e/kpi-upload.spec.ts`) — both login
   helpers now use `{ exact: true }`.

**Still outstanding after the merge**: a quick visual pass of the login
motion — now in production — stripe glints, mascot poses/transitions, wave
parallax, easter egg. If the mascot's reveal height looks off, the knob is
the `-top-16` on its wrapper in `app/login/page.tsx` (math says: mouth fully
visible, resting hands hidden behind the card edge). CI (incl. e2e) was green
on the merged head.

### Previous session recap (PRs #127–#135)

Freelancer Payment module (rates × center group, commitment matrix, CC
position, multi-record months, late submissions 补交, KPI-bound student result,
bank-transfer XLSX export); Workforce rename + Payees tab with Payment Summary
xlsx import; roster scoping (`lib/staff/roster.ts`); Student Progress module
(staging pipeline extracted from KPI Uploads); hierarchy-scoped user
management; login/launcher racing-stripe experience; `EmptyState` server-safe
fix (the persistent Uploads 500).

## Open / needs attention

- **Login motion visual QA** (PR #142 is merged, so this is production now):
  stripe charging glints, mascot poses, wave parallax, the 5-tap easter egg —
  see "Still outstanding" above for the tuning knob.
- **Remember-last-email on the login page** was deliberately left out of the
  interactivity batch (localStorage on shared devices leaks who signed in) —
  pending Leon's call; trivial to add to `app/login/page.tsx` if wanted.
- **CC bonus semantics are an assumption**: CC gets the hours-based commitment
  bonus and no student result (like PA/T0). The operator only specified rates
  (RM26/42) — **confirm with Leon**; if CC should earn no bonuses at all, edit
  `NO_COMMITMENT_POSITIONS` in `lib/freelancer/types.ts`.
- **One-time data load**: Leon still needs to run Workforce → Payees →
  "Import summary file" with `05-2026 Payment Summary.xlsx` (Drive:
  Optimum Management/Freelancer/Freelancer Payment/Year 2026/05-2026) to seed
  the ~180 freelancer profiles, then spot-check against the Excel.
- **External developer** (`optimummarketing`, write collaborator) builds on
  branch `claude/staff-income-report`; his KPI push integration is live and
  its API contract must stay stable (locked by `app/api/ingest/kpi` tests).
- **Repo workflow**: `main` requires 1 approving review — merging via the
  GitHub **API with admin rights bypasses it**; the web UI needs the "bypass
  rules" checkbox. Squash-merge is the convention (one commit per PR). The
  account's GitHub API quota is easily exhausted by automation — when rate
  limited, merge via the web UI (no API quota).
- Login stripe-band geometry mirrors the login layout's Tailwind values by
  hand (`components/login-stripe-band.tsx` docblock lists them) — if the card
  size/offsets change, update the constants there and in `stripeLegsMidX`
  (`components/stripe-arrow.tsx`, shared with the dashboard ribbon so the
  login → dashboard cut stays continuous). The PR #142 login work deliberately
  left the card's size/position untouched.

## Environment notes (Claude Code on the web)

- This sandbox can't download Playwright browsers (CDN not allowlisted) and
  can't delete remote branches. Do those on a normal machine / the GitHub UI.
  CI runs the Playwright e2e suite (`e2e/`), so e2e regressions surface there,
  not locally.
- Google Drive + Gmail MCP tools are connected (used to read the operator's
  Payment Summary directly from the shared drive).
