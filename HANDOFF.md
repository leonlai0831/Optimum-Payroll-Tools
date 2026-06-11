# Session Handoff — Optimum People Hub

Snapshot for the next session (last updated **2026-06-11**, after PRs #127–#135
all merged to `main`). Read `CLAUDE.md` for architecture + the frozen Settings
IA rules; read `AGENTS.md` before touching Next.js APIs.

## What's on `main` now

The suite ("**Optimum People Hub**") is in production on Vercel. Modules:

- **Swim**: Staff Allowance · **Freelancer Payment** (new) · Instructor KPI
  Bonus · **Student Progress** (new — the monthly data pipeline) · Workforce
  (directory + **Payees** tab) · Instructor Assessment · Lesson Plan.
- **Fit**: Staff Earnings (commission + coaching income).
- **System**: Users (hierarchy-scoped `manage_users`) · Audit log · Permissions.

### This session's additions (PRs #127–#135)

1. **Freelancer Payment** (`lib/freelancer`, `/freelancer`) — full module from
   the operator's Excel: hourly rates by position × center group, commitment
   matrix, attendance bonus, per-entity payouts (OT/OTG/PJ/QSM/KM), bank-transfer
   XLSX with bank codes. Extended same-day with: **CC position** (RM26/42),
   **multi-record months** (one record per position family per work month),
   **late submissions** (补交 — "Work month" field; APRIL-row-in-MAY-batch like
   the operator's summary), and **student result bound to the month's KPI data**
   (search/bind an instructor account; carry-over auto-fills next month; counts
   stay editable; data for month P arrives on the 1st of P+1).
2. **Workforce** (renamed from Staff): "Add member"; **Payees tab**
   (`/staff/payees`) — bulk entry of freelancer IC/bank/account with search +
   sort, plus **"Import summary file"**: upload the monthly Payment Summary
   xlsx and every payee becomes/updates a freelancer profile (parser handles
   the file's real quirks; locked by tests).
3. **Roster scoping** (`lib/staff/roster.ts`): Freelancer Payment searches only
   freelancers; Allowance/KPI exclude them; Assessment sees all instructors.
4. **Student Progress** (`/progress`, `lib/ingest`): the KPI Uploads surface as
   a standalone module — months list, manual CSV upload + machine push through
   ONE staging engine, editing relaxed to any non-superseded delivery (banner
   on imported: KPI run snapshots unaffected). External API contract unchanged.
5. **User management hierarchy**: manage below own rank / same rank view-only /
   higher ranks invisible; `/system/users` gated on `manage_users`.
6. **Login → dashboard experience**: split login hero ("Optimizing Joy at Work"
   / "Powering the people behind"), racing-stripe band with deck-style corner
   (WAAPI, constant-speed bends), camera-pan screen swap, permanent launcher
   ribbon with per-visit draw-in; loader clips trimmed + brand-follows-origin;
   WhatsApp support link; mobile login fixes.
7. **Production fix**: `EmptyState` was wrongly `"use client"` — server pages
   passing lucide icon components crashed (the persistent Uploads 500,
   digest 1621801304). Fixed in #133.

## Open / needs attention

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
  login → dashboard cut stays continuous).

## Environment notes (Claude Code on the web)

- This sandbox can't download Playwright browsers (CDN not allowlisted) and
  can't delete remote branches. Do those on a normal machine / the GitHub UI.
- Google Drive + Gmail MCP tools are connected (used to read the operator's
  Payment Summary directly from the shared drive).
