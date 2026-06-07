# Session Handoff — Optimum Payroll Tools

Snapshot for the next session. Everything below is **merged to `main`** unless
stated otherwise. Read `CLAUDE.md` for the architecture and the frozen Settings
IA rules; read `AGENTS.md` before touching Next.js APIs.

## What's on `main` now

The app is feature-complete for a first production rollout:

- **KPI Bonus** calculator (upload CSV → AI/deterministic name-merge →
  client-side scoring → leaderboard + per-coach detail → save month), **History**,
  **Trends**, editable **Settings**. Scoring is byte-for-byte v11.1 by default.
- **Staff Allowance** calculator + history + rate settings.
- **Staff** module: directory, per-employee profile, **notes**, read-only
  **assessment** records (instructor assessments live in their own module).
- **Per-user auth + RBAC**: email/password, roles (super_admin / admin / staff),
  editable capability matrix, users + permissions admin pages. First super admin
  bootstraps from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`.
- **UX system** (phases 1–4): design tokens, Toast / Modal / Drawer / EmptyState /
  Skeleton primitives, ConfirmModal everywhere, section error boundaries.

### Landed follow-ups (PRs #4–#7, all merged)

- **#4 Deployment self-check** — public, no-auth **`/setup`** page + **`/api/health`**
  JSON report (DB configured? migrations applied? a login account exists?
  `SESSION_SECRET` set?). Only booleans + hints, never secret values. New
  **`DEPLOY.md`**; README updated off the removed shared-password onto `SUPER_ADMIN_*`.
- **#5 Cleanup** — Dashboard CSV-upload errors now go through Toast (inline-error
  sweep complete app-wide); the AI-insight panel uses a Skeleton while loading.
- **#6 Audit log** — `audit_log` table (migration `0007`) + `recordAudit()` /
  `listAuditLog()`; sensitive mutations are recorded (settings, permissions,
  user create/update/delete, allowance save, KPI-run
  save). Read-only **`/staff/audit`** page gated by the new `view_audit`
  capability (default: admin + super_admin). Records forward from deploy only.
- **#7 E2E** — `e2e/integration-smoke.mjs` (`npm run test:smoke`, no browser,
  verified 9/9) covers the auth gate + KPI save→history. Playwright specs
  (`e2e/*.spec.ts`, `npm run test:e2e`) cover login + CSV-upload→leaderboard.

## Open / needs attention

- **Playwright browser E2E is gating and green again — resolved in #60.** The
  stale `kpi-upload` spec (it asserted coach names on the leaderboard, which now
  hides coaches without a teaching allowance) was rewritten to assert the upload
  → results view, and `continue-on-error` was dropped so the `e2e` job gates. CI
  downloads its own browser; the HTTP smoke still gates alongside it.
- **Three old branches couldn't be deleted from the sandbox** (`git push
  --delete` is rejected by this git proxy): `claude/brave-hopper-Ld9GO`,
  `claude/laughing-wright-Zj9Ri`, `claude/phase-3-continuation-DAy4I`. Delete
  them from the GitHub Branches UI — all merged, safe.
- **Audit coverage** now also records performance **notes** (create/delete) and
  **staff-profile** edits (create/update/delete), alongside the existing
  settings, permissions, users, and saved-run coverage.

## Verify / run

```bash
npm install
npm run dev          # http://localhost:3000  (dev login: admin@local / swim123)
npm run lint
npm run typecheck    # run AFTER `npm run build` once, so Next route types exist
npm test             # Vitest — 48 unit/DB tests
npm run build
npm run test:smoke   # HTTP critical-path smoke (needs a running dev server)
npm run test:e2e     # Playwright (needs a browser; install: npx playwright install chromium)
```

No `POSTGRES_URL` → in-process PGlite at `./.pglite` (no cloud DB needed locally).

## Deploy

See **`DEPLOY.md`**. Short version: import to Vercel → attach Postgres (Prod +
Preview) → set `SESSION_SECRET` + `SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_PASSWORD`
(+ optional `ANTHROPIC_API_KEY`) → deploy → open **`/setup`** and confirm every
check is green → sign in. Migrations auto-apply on first DB connect.

## Suggested next development (priority order)

1. **Browser E2E — done (#60).** The Playwright suite is green and gating; the
   `continue-on-error` escape hatch is gone. This item is closed.
2. **Reporting & exports** *(highest net-new value)* — **done in PR #9** (pending
   merge): per-coach PDF payslip (`GET /api/coaches/[id]/payslip?period=…` via
   `pdf-lib` + a "Payslips" card on the staff profile) **and** the monthly
   all-coach summary CSV (`GET /api/runs/[id]/summary` + a "CSV" action per month
   on `/kpi/history`, gated by `view_all_staff`, audited as `summary.export`).
3. **Supervisor role** — **done in PR #9** (pending merge): `supervisor` is now a
   first-class configurable account role (added to the RBAC matrix + user role
   picker; default capabilities = oversee & review the team + run the monthly
   numbers, with no profile edits / user management / settings edits / audit
   access). `users.role` is a text column so no migration was needed, and stored
   matrices backfill the new role's defaults on read. *Deliberately not done:*
   center-scoped visibility — supervisors still see all staff via `view_all_staff`
   like admins; per-center scoping is a larger follow-up.
4. **Observability** — **done in PR #9**: structured logs (`lib/log.ts`, one JSON
   record per line; `LOG_LEVEL` env, default `info` in prod) **and** Sentry error
   monitoring (`lib/observability.ts` + root `instrumentation.ts`): initialized
   from `SENTRY_DSN` in the Node runtime only, a graceful no-op when unset;
   captures unhandled server errors via Next's `onRequestError` and auto-forwards
   every `logger.error`. Set `SENTRY_DSN` (+ optional `SENTRY_ENVIRONMENT`,
   `SENTRY_TRACES_SAMPLE_RATE`) in the deploy env to activate. *Couldn't be
   live-verified here* (no DSN / outbound Sentry); build + unit tests cover the
   wiring and the no-op path. A request-level access log is a natural next add.

## Environment notes (Claude Code on the web)

- This sandbox can't download Playwright browsers (CDN not allowlisted) and can't
  delete remote branches via `git push --delete`. Both are environment limits,
  not code problems — do them on a normal machine / the GitHub UI.
- `~/.claude/settings.json` has `enableWorkflows: true`. `ultracode` is
  session-scoped — start a session with `claude --settings '{"ultracode": true}'`
  rather than persisting it to the file.
