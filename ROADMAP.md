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

- ✅ **A. Clock-in entry redesign** — DONE: mode auto-locked by `coaches.jobRole`
  (no toggle); a lesson is a start/end session with multiple (classType, hours)
  lines whose sum ≈ span (±0.25 h) or it blocks, persisted one row per line.
  Pure parsing Vitest-locked (`parseTimesheetSession` + `sessionToEntries`).
- ✅ **B. Notification badges — launcher cards AND section-nav tabs** — DONE: one
  shared count helper (`lib/nav/badges.ts` → `attentionBadges` + `launcherBadgeCount`,
  Vitest-locked) + a shared `<CountBadge>` light up BOTH the launcher card icon corner
  AND the matching tab. Sources: System → Errors (`countAppErrors`), Clock-in → Review
  (`countTimesheetsForReview`), Lesson Plan → History (`countLessonPlansForReview`).
  Capability-gated (super_admin = all); best-effort; non-reviewers run zero queries.
  Counts gain a center filter for free once C lands.
- ✅ **C. Center-scoped approvals** — DONE: `users.managedCenters` (jsonb, NULL/empty
  = all, super_admin = all; migration 0039), assigned per-user on the
  `/system/permissions` "User overrides" tab (super_admin-only, canonicalized
  against the configured centers; selecting all collapses to unrestricted).
  Timesheet + lesson-plan review queues / counts / batch-approve filter by the
  reviewer's centers; the badge counts match. KPI is company-wide, so a
  center-restricted admin can't review/finalize/reopen/delete a run at all
  (reserved for super_admin + all-centers admins). Pure helpers + queue filters
  Vitest-locked.
- ✅ **F. Clock-in lesson session v2** (operator request 2026-06-14) — DONE:
  ① **one row per class type** — the type dropdown only offers unused types, "Add
  class" disables once all are used, and `parseTimesheetSession` merges duplicate
  types (raise hours to log more); ② the per-line number is labelled **hours** with
  a note **Young Swimmer = 0.5 h/class, others = 1 h** (0.5-h steps; ±0.25 h gate
  kept); ③ the per-line rows collapse back into the clocked window via the pure,
  Vitest-locked `groupSessionWindows` so the coach's list + reviewer's queue show
  **one record**, and the coach's delete (bulk `DELETE /api/timesheets`) + the
  reviewer's approve/request-changes act on the **whole window together**. Chose
  group-by-window-key (no `sessionId` migration); persistence stays one row per
  class line so payroll aggregation/reconcile are untouched.
- ✅ **D. Permissions / "Per-account access" redesign** — DONE (all six asks).
  Both cards (the renamed **"Per-account access" tab**) ship Full Name + Search +
  per-column Sort + Role/Access/Status Filter + select-all + a bulk action bar
  (一键勾选/取消), built on the E kit. #4 (category control removed from the Roles
  tab — capabilities only now) + #6 (Visibility column dropped; the category card
  is now **direct-edit** checkboxes, no Override/Reset/inherit) shipped with **G**.
- **E. List-control standardization** — every data list must ship Search + Sort +
  Filter, plus select-all/clear where it has row checkboxes; all via the shared
  `components/table-controls.tsx` kit (no more one-off `useState("")` + `.filter()`).
  Rollout (operator decision 2026-06-13): **kit + docs FIRST** — extend
  table-controls with `SearchInput` / `FilterBar` / `useRowSelection` /
  `SelectAllCheckbox`, migrate the 2 existing select-all surfaces (timesheet review,
  permissions matrix) as the reference, write the standard into `CLAUDE.md`
  Conventions — THEN convert the ~15 missing lists in per-module batches (one clean
  PR each). Inventory baseline (2026-06-13): 23 lists — search 8, sort 9, filter 6,
  select-all 2.
- ✅ **G. Default-deny launcher categories + drop the Visibility column** — DONE.
  `DEFAULT_PERMISSION_CONFIG.categories` flipped to `[]` per role (super_admin always
  all); the Roles tab no longer edits categories; the per-account card is direct-edit.
  **Migration 0040** does the safe rollout: snapshot each inheriting account's current
  effective categories into a per-user override, THEN flip the stored role defaults to
  `[]` — existing accounts keep access, only NEW accounts default-deny (audited,
  idempotent/replay-safe). Verified in dev: pre-existing accounts snapshotted to
  all-three, a freshly-created account sees nothing.

## P2 — System review backlog + execution order (2026-06-14)

A four-dimension system review (product / code-quality / UI-UX / security) ran
2026-06-14; the operator asked to fold **every** finding into the plan and let
the agent set the order. The ordered execution plan below is the source of
truth for "what's next"; the grouped findings under it are the detail. Do
**one clean PR at a time** per the SOP (correctness + security first, then
high-value product, then cleanup). Items marked **[E]** belong to the existing
E rollout and stay tracked there; **[P0]** items also serve the June go-live.

**Execution order (one PR each, top first):**

1. **Lesson-plan center-scope IDOR fix** (security, confirmed). `GET /api/lesson-plans/[id]`
   + the PDF route gate only on `canViewPlan`; add `canManageCenter(user.managedCenters,
   plan.center)` for non-creator reviewers (mirror the `/review` guard). +test.
2. **allowance-calculator stable-`_key` fix** (correctness). Editable teaching/other
   rows reconcile by **array index** (`allowance-calculator.tsx` ~L117-141), violating
   the project rule — removing a middle row shifts focus/values to a neighbour.
   Switch to a stable `_key` like freelancer already does.
3. **Payroll-correctness guards** (split into ≤2 PRs): ① KPI finalize **incomplete-coach
   gate** + **unlinked-allowance list** on `RunReview` (data already in `missing[]` /
   `reconcileAllowances.orphanRecs`); ② **payee-completeness gate** before the freelancer
   bank-file export (block/confirm with the names missing IC/bank/account). **[P0]**
4. **Payee PII scoping** (security). `swim_view_staff` returns every staff member's IC +
   bank account via `/api/coaches`; drop those from the default projection, serve only to
   a payee capability (`run_freelancer`/`swim_edit_staff`).
5. **Monthly-close cycle dashboard** (product, biggest gap). A "This month" status strip
   on the launcher computed from existing `runs`/`allowanceRuns`/`freelancerRuns` +
   pending ingests — Not started / Draft / Finalized per module in dependency order. Pure
   rollup, no new tables.
6. **Allowance bank XLSX export** (product gap). Allowance has only client CSV; freelancer
   + commission have bank XLSX. Add a bank-transfer XLSX (reuse `lib/freelancer/banks.ts`
   + payee fields).
7. **[E] continue list-control batches ②③④** — `/progress` · `/system/audit` ·
   `/system/errors` · `/timesheets/schedules` → `/lesson-plans/history` (also gets the
   UI-review's search+sort) → KPI run detail · `/staff/payees`. The UI-review's
   `kpi-ingest-editor` one-off search folds in here. (batch ① shipped #191.)
8. **Code cleanup quick wins** (S each, Vitest-lockable): `useConfirmAction` +
   `<ConfirmActionButton>` (5 + 2 inline clones); `xlsxResponse(buf, filename)` (6 export
   routes); **`lib/money.ts` `round2` + `canonicalCenter()`** — consolidation forces a
   decision on the **real latent inconsistency** (timesheet upper-case vs freelancer
   lower-case center keys; commission's `+EPSILON` round); `requireCapabilityWithUser` +
   `recordAuditAs` (~40 routes re-read the session just for the audit actor).
9. **UI quick wins** (S): shared `IconButton` (ui.tsx) with required `aria-label` + migrate
   icon-only buttons (a11y); `RunReview` Save/Finalize spinner; `loading.tsx` skeletons for
   `freelancer/` + `timesheets/`; `SortTh` resting-opacity (drop hover-only hint).
10. **Larger refactors** (M-L, opportunistic): grouped `RunHistoryShell` (fold
    allowance + freelancer accordions in); generic `<MultiSeriesTrends>` (4 near-dupe
    trends views, ~600→~150 lines); calculator shared hooks (`useSaveRun` /
    `useCoachPicker` / `useLoadFromClockIn`); base `SearchableDropdown` (employee/staff
    comboboxes bypass `ui.tsx`); `OverridesTable<T>` (category vs center, ~570 lines each);
    `singletonConfigRoute<T>()` + `defineSingletonConfig()` (5 config routes + 5 query
    triplets). **[P0]** freelancer Excel-vs-system **parallel-run diff tool** sits here.
11. **Product glue** (M): carry-over **staleness badges** (mgmt assessment / allowance age
    from the stored `*At`); **instructor-360 setup-health** (logins unlinked / freelancers
    with no schedule / missing payees); **badge deep-links** (badged card → pre-filtered
    review queue); **P+1 "data arrived" signal** on the cycle dashboard + Student Progress.
12. **Security hardening (low)**: login dummy-hash for constant-time on missing user;
    back login/ingest rate-limits with a shared store (or Vercel WAF); `Number.isInteger`
    400 + center/ownership scope on the bare-id DELETE routes (notes/assessments/gym-staff/
    coaches).

**Needs an owner decision (not auto-scheduled):**
- **Outbound notifications** (email/push/WhatsApp) — today staff must log in to learn of
  an approval/rejection; there is no notification layer at all. Big, product-shaped.
- **Bulk-overwrite password reset** — `users.bulk` overwrite resets passwords with no
  force-change-on-next-login flag; confirm the intended blast radius.

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
