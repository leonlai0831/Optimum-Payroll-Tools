# Roadmap

Working notes for in-flight initiatives — enough for a fresh session (or a
teammate) to pick up without replaying chat history. `main` is the source of
truth; this file only records **intent** and **what's left**. Rewritten
2026-06-12 with the owner.

## P0 — June freelancer payroll go-live

**Intent:** June 2026 is the first month freelancer pay is computed in the
system instead of the Excel chain. The engine is numerically ready — the May
tally check reproduced the operator's real payouts to the cent (22/22 sampled
records at delta RM 0.00 with the final CC rule; details in `HANDOFF.md`).
The CC commitment question is SETTLED (May practice stands: CC earns
hours-based commitment; locked by `calc.test.ts` with the May numbers).

What's left, in order:

1. **One-time payee load (Leon, one click):** Workforce → Payees → "Import
   summary file" with `05-2026 Payment Summary.xlsx` (Drive: …/Year
   2026/05-2026/PV) → ~207 freelancer profiles; spot-check a handful against
   the Excel.
2. **June parallel run:** compute June in the system while the operator runs
   the Excel chain as usual; diff per person before anything is paid. The
   May check validated the engine on history — the parallel run validates
   inputs + process with real stakes. Treat any per-person delta > RM 0.01
   as a blocker.
3. **Payee completeness pass before the first bank-file export** (IC / bank /
   account on every active freelancer — the import reports gaps).

## P1 — Observability follow-ups (v1 shipped in PR #148)

In-app error log is live: `app_errors` + `/system/errors`, server sink +
browser reporter, optional Sentry via `SENTRY_DSN`.

- ✅ **Route error boundaries** + ✅ **unseen-error badge** — shipped in **#172**
  (`app/error.tsx`, `app/global-error.tsx`, launcher System-card count).
- **Set `SENTRY_DSN` in prod or decide not to** — the in-app log works either
  way; Sentry adds alerting + grouping. (still open)

## Active queue (2026-06-13 — full detail + decisions in `HANDOFF.md`)

Operator feedback batched faster than build; do **one PR at a time**, in order.

- **A. Clock-in entry redesign** — branch `claude/clockin-entry-redesign` (pushed,
  validator done): auto-lock Lesson/Shift by `coaches.jobRole`; lesson = start/end
  + multiple (classType, hours) lines whose sum ≈ span (±0.25 h) or it blocks.
- **B. Launcher notification badges** — per-module pending-approval count on each
  card's icon corner (Clock-in → timesheets to review, Lesson Plan → plans to
  review); reuse/reposition the #172 errors badge.
- **C. Center-scoped approvals** — `users.managedCenters`; admins approve only
  their branch's requests (super_admin = all). Filter the review queues by the
  request's center.
- **D. Permissions / User-overrides redesign** — full name, search + per-column
  sort/filter, bulk check/uncheck filtered rows, move category control off the
  Roles tab, rename "User overrides", drop the Visibility column.
- **Marketing visibility** — owner unticks "Optimum Marketing" for staff/supervisor
  on `/system/permissions` (no code); root cause: all roles default to all 3
  launcher categories + the Marketing card has no capability gate.

## Backlog (unordered — pick with the owner)

- **Staff self-service**: a coach/freelancer signs in and sees their OWN
  payslips / payment history (auth + roster linkage already exist; needs a
  scoped read surface and a product decision on what's visible).
- **Marketing KPI module product definition** — the external developer has a
  sandbox (`ONBOARDING.md`) but no spec; without one, nothing should be
  built there.
- **Monthly data-pipeline automation**: the ingest API is live for KPI rows;
  the freelancer side still runs on per-person Excel files. Long-term:
  hours/absence entry in-app, killing the workbook merge step.
- **Audit-log retention/paging** (currently "last 200") if usage grows.

## Decided — do not reopen without the owner

- **Remember-last-email on login: NO** (2026-06-12) — shared front-desk
  devices must not leak who signed in. The 10-minute idle auto-logout
  (PR #148) is the direction login security moves in.
- **No appraisals in the gym-staff module** (parity initiative, complete —
  see git history of this file for the full record).
