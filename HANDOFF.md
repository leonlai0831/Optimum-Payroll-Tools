# Session Handoff — Optimum People Hub

Snapshot for the next session (last updated **2026-06-12**, THIRD session of
the day). `main` holds PRs #136–#145; **PR #148 (this session) is an open
draft** carrying everything below. Full suite 421 passing. Read `CLAUDE.md`
for architecture + the frozen Settings IA rules; read `AGENTS.md` before
touching Next.js APIs. `ROADMAP.md` was rewritten this session — the June
payroll go-live plan and the open CC decision live there.

## What's on `main` now

The suite ("**Optimum People Hub**") is in production on Vercel. Modules:

- **Swim**: Staff Allowance · Freelancer Payment · Instructor KPI Bonus ·
  Student Progress (the monthly data pipeline) · Workforce (directory +
  Payees tab) · Instructor Assessment · Lesson Plan.
- **Fit**: Staff Earnings (commission + coaching income).
- **System**: Users (hierarchy-scoped `manage_users`) · Audit log · Permissions.

### Earlier 2026-06-12 work (PRs #137–#143, recap)

Project renamed to Optimum People Hub (#137); system-wide audit hardening —
concurrency races closed under advisory locks, `getCenterTarget` made
deterministic, `SESSION_SECRET` fails fast in prod (#138–#141); freelancer
duplicate-save confirm + the login interactivity batch (mascot rig, password
reveal, Caps Lock hint, failure feedback, email completion chip, charging
glints, wave parallax, 5-tap easter egg) (#142); handoff record (#143).

### This session's work — PRs #144 + #145 (both MERGED 2026-06-12)

**PR #144 — login polish (squash `d562ffe`)**:

1. **Mascot redrawn to match `logo-mark.png`**: rounded-SQUARE yellow goggle
   frames (were circles) and YELLOW hands/arms with a darker amber outline
   (were warm white) — operator's spot of the mismatch.
2. **Charging-glints intermittency fixed**: the white "current" only ran while
   the sign-in request was in flight, and warm production sign-ins resolve in
   ~200ms — too short for the glints' fade-in + travel, so the effect read as
   sometimes-there-sometimes-not. Submit now holds the in-flight state ≥
   `MIN_CHARGE_MS` (700ms, `app/login/page.tsx`), padding fast responses.
3. **Click toys on the login page**: tap the painted wave → drift surges 6×
   for 2s (WAAPI `updatePlaybackRate` + one-shot crest rear-up); tap a stripe
   bar or the arrow → one-shot glint current; tap the mascot → transient
   reaction alternating a new "boop" surprise pose with the cheer. Enabled by
   pointer-events plumbing: the login content wrapper is `pointer-events-none`
   (its two children re-enable), bands/wave re-enable hits on painted strokes
   only.

**PR #145 — the same toys on the launcher (squash `a97287b`)**:

- `components/splash-wave.tsx`: click-to-surge extracted from the login page,
  reused on the hero (login refactored onto it; parallax unchanged).
- `components/hero-mascot.tsx`: the rig floats half-submerged in the hero
  wave (rendered BEFORE the wave svg so the crest paints over its lower half),
  idle blink + bob, tap → boop/cheer reaction.
- Hub ribbon click current: at `-z-10` the ribbon's strokes can never win
  hit-testing, so `hub-stripe-band.tsx` listens on the document and tests the
  click point against the ribbon's known geometry (legs/arc/runs ± half-bar;
  interactive elements + `#hub-hero` excluded; armed only after the draw-in
  finishes via a ref).

Operator also reported the hub ribbon "misplaced on resize" — that turned out
to be browser zoom (narrower effective viewport → legs re-anchor at
`vw − 150` and thread behind the cards), confirmed not a bug.

### Third 2026-06-12 session — PR #148 (open draft)

All on branch `claude/keen-allen-rd0y1l`, operator-directed live during the
session:

1. **Mascot redraw**: oval goggles (16×12 frames / 11.5×7.5 glass, bridge +
   strap + pupils centered on the lens midline) + the crest bump removed —
   two rounds, the operator rejected the first oval pass as "egg-shaped".
2. **CC commitment rule**: `CC` → `NO_COMMITMENT_POSITIONS` per the
   operator's instruction — but see the contradiction in the open items.
3. **Idle auto-logout (10 min)**: `lib/auth/idle.ts` policy (unit-tested),
   `lastSeenAt` in the session, `POST/GET /api/auth/touch` heartbeat,
   `components/idle-logout.tsx` in the (app) layout (multi-tab-safe: asks the
   server before logging out). Sessions from before this deploy lack
   `lastSeenAt` → everyone re-logs-in once.
4. **Error tracking**: `app_errors` table (migration 0033) + always-on server
   capture (error-log sink + `onRequestError` → DB; Sentry stays optional on
   top), browser reporter in the root layout → rate-limited proxy-exempt
   `POST /api/errors`, super_admin `/system/errors` page with audited
   Clear-all, 30-day opportunistic retention. See CLAUDE.md "Error tracking
   & logs" (the sink-recursion rule matters: `recordAppError` must never log).
5. **May tally verification** (read-only, Drive MCP + repo engine) — results
   in the open items below; full report was at `/tmp/freelancer-tally-report.md`
   in the session container (regenerate by re-running the check; the method
   is described in the open items).

## Open / needs attention

- **Visual QA on real devices** (everything above is in production): login
  charging current now guaranteed visible each sign-in; launcher hero mascot
  (half-submerged position vs the drifting crest), wave surge, ribbon current
  along the visible segments (right margin, grid gaps). Mascot hero position
  knobs: the wrapper classes in `components/hero-mascot.tsx`
  (`bottom-6 right-6 w-12 sm:bottom-8 sm:right-10 sm:w-16`).
- **Remember-last-email: DECIDED — not doing it** (Leon, 2026-06-12;
  localStorage on shared devices leaks who signed in). Instead the login got
  stricter: **10-minute idle auto-logout** shipped (see session notes below).
- **CC bonus semantics — CONTRADICTION, needs Leon's re-confirmation.** Leon
  said (2026-06-12) CC earns NO commitment bonus → `CC` added to
  `NO_COMMITMENT_POSITIONS` (`lib/freelancer/types.ts`), locked by
  `calc.test.ts`. But the May tally check (below) found the operator DID pay
  commitment on CC work in May: CHUAH SHAN YI's "(PRE COM)" record is billed
  at the CC rate (42/h group B) with 66h → 15% commitment + 20% attendance =
  RM 3,515.40 + 226.80, exactly the Excel; today's rule pays RM 415.80 less.
  Code follows Leon's instruction; if May practice should stand instead, the
  whole fix is removing `"CC"` from `NO_COMMITMENT_POSITIONS` (and flipping
  the calc.test case). Note: the summary never says "CC" — CC work hides
  inside I1 rows via an in-file rate override, so imports can't detect it by
  position. Attendance for CC was confirmed correct by the same record.
- **One-time data load**: Leon still needs to run Workforce → Payees →
  "Import summary file" with `05-2026 Payment Summary.xlsx` (Drive:
  Optimum Management/Freelancer/Freelancer Payment/Year 2026/05-2026/PV) to
  seed the ~207 freelancer profiles, then spot-check against the Excel.
- **May tally check DONE (2026-06-12, read-only, via Drive MCP)**: the repo
  engine reproduces the operator's real May payouts **to the cent** — summary
  internally consistent (5 entity sections sum to their TOTALs, grand total
  RM 245,759.30 across 208 source workbooks / 207 people), and a 21-person /
  22-record sample covering every position, both center groups, both APRIL
  late submissions, absences, extras and the multi-file merge matched at
  delta RM 0.00 on every per-entity amount — EXCEPT the one CC record above
  (RM 415.80, entirely explained by today's CC rule change). Rate table +
  commitment matrix embedded in the workbooks are identical to
  `lib/freelancer/defaults.ts`. So the system is numerically ready for a June
  parallel run once the CC question is settled.
- **External developer** (`optimummarketing`, write collaborator) builds on
  branch `claude/staff-income-report`; his KPI push integration is live and
  its API contract must stay stable (locked by `app/api/ingest/kpi` tests).
- **Repo workflow**: `main` requires 1 approving review — merging via the
  GitHub **API with admin rights bypasses it**; the web UI needs the "bypass
  rules" checkbox. Squash-merge is the convention (one commit per PR). The
  account's GitHub API quota is easily exhausted by automation — when rate
  limited, merge via the web UI (no API quota).
- **Gotcha learned this session — a CONFLICTED PR runs no Actions at all**:
  `pull_request` workflows run against the merge ref, which GitHub can't
  create while the PR has conflicts, so CI silently never starts (no failure,
  no run; opened/synchronize/reopened all ignored — meanwhile Vercel builds
  the branch head normally, which makes it look like an Actions outage).
  Empty commits and close/reopen don't help; `workflow_dispatch` via the
  integration token is 403. **Fix the conflict (rebase) and CI fires
  immediately.** It bit here because the session container had cloned `main`
  from before the previous PR's squash-merge, so the next PR from the same
  branch was conflicted from birth — when reusing a session branch across
  merges, rebase onto fresh `origin/main` before opening the next PR.
- Login stripe-band geometry mirrors the login layout's Tailwind values by
  hand (`components/login-stripe-band.tsx` docblock lists them) — if the card
  size/offsets change, update the constants there and in `stripeLegsMidX`
  (`components/stripe-arrow.tsx`, shared with the dashboard ribbon so the
  login → dashboard cut stays continuous).

## Environment notes (Claude Code on the web)

- This sandbox can't download Playwright browsers (CDN not allowlisted) and
  can't delete remote branches. Do those on a normal machine / the GitHub UI.
  CI runs the Playwright e2e suite (`e2e/`), so e2e regressions surface there,
  not locally.
- No `gh` CLI — use the GitHub MCP tools. Anonymous api.github.com calls from
  the sandbox rate-limit quickly (shared egress IP).
- `npm install` + `npx next typegen` are needed before `npm run typecheck`
  works in a fresh container (the `RouteContext` types are generated).
- Google Drive + Gmail MCP tools are connected (used to read the operator's
  Payment Summary directly from the shared drive).
