# Session Handoff — Optimum People Hub

Snapshot for the next session (last updated **2026-06-14**). `main` is green:
**vitest 517/517**, typecheck + lint clean, `next build` OK. Read `CLAUDE.md` for
architecture + the frozen Settings IA rules; read `AGENTS.md` before touching
Next.js APIs.

## This session (2026-06-14) — backlog C shipped (#180) + clock-in v2 queued

1. **#180 — Backlog C: center-scoped approvals.** `users.managedCenters` (jsonb,
   NULL/empty = all, super_admin = all; **migration 0039**). Assigned per-user on
   the **`/system/permissions` "User overrides" tab** (new "Center scope" card,
   `components/center-overrides.tsx`) — super_admin-only to write (like categories),
   validated + **canonicalized against the configured centers**, and **selecting
   every center collapses to NULL** (= unrestricted). Resolved onto
   `CurrentUser.managedCenters` via `effectiveManagedCenters`. Enforcement: timesheet
   + lesson-plan review **queues, badge counts, and batch-approve** all filter by the
   reviewer's centers (the SSR `/timesheets/review` + `/lesson-plans/history` pages,
   the APIs, AND the counts — scoped consistently; the SSR pages were the
   `/code-review` catch); lesson-plan single-review guards on `canManageCenter`. **KPI
   is the exception** — a month is one company-wide run, so a center-restricted admin
   can't review/finalize/reopen/delete it at all (`companyKpiDenied`). Pure helpers +
   queue filters Vitest-locked; `/code-review` (high) run + addressed before merge.
   Operator decision confirmed this session: assignment UI on `/system/permissions`
   (super_admin-only authority boundary), per-user only (no per-role center defaults).
   **NOT browser-QA'd** (the new Center-scope UI).
2. **New operator request (2026-06-14): clock-in lesson session v2** — captured as
   backlog **F** below (the next START-HERE). NOT built this session (queued per the
   operator's "新增一个开发计划").

**Follow-ups (carry):** browser-QA the Center-scope UI (#180) + A/B from last
session; the DB cold-start follow-up (verify `/system/errors` is clean now, then the
operator points `POSTGRES_URL` at the Neon **pooled** endpoint). Next build items:
**F (clock-in v2, START-HERE)**, then the E PR-kit before D (D builds on it).

## This session (2026-06-13→14, continuation 3) — SOP + backlog A & B + DB fix (#174–#178)

A **development SOP** was added (CLAUDE.md → "Development SOP — per-feature loop"):
per feature → build + `/code-review` + lint/typecheck/test/build → **auto-merge when
CI green** (standing authorization, no per-PR ask) → docs → check token budget then
continue or hand off. **Doc-maintenance policy** (operator, this session, in the
SOP): `CLAUDE.md` = system facts/rules (in the feature PR); `ROADMAP.md` =
intent/priority/decisions (in the feature PR); `HANDOFF.md` = the session snapshot
(THIS file), refreshed **at session end only**, not per feature. Then, one clean PR
each, all squash-merged after `/code-review` + green CI:

1. **#174 — Planning docs (no code).** Captured backlog **B** (expanded) + **E**
   (new) with full code maps, plus the SOP + doc policy itself.
2. **#175 — Backlog A: Clock-in entry redesign.** Mode auto-locked by
   `coaches.jobRole` (front_desk → shift, else lesson; toggle removed). A lesson is
   now a SESSION — a start/end window with one-or-more `(classType, hours)` lines, a
   live sum-vs-span gate (±0.25 h), persisted **one lesson row per line**
   (`sessionToEntries`, Vitest-locked). `POST /api/timesheets` routes a `lines` body
   through `parseTimesheetSession`; shift/legacy path unchanged. The stale
   `claude/clockin-entry-redesign` branch is **SUPERSEDED** (its validator was
   cherry-picked onto fresh main) — ignore it.
3. **#176 — Backlog B: attention badges (launcher cards + section-nav tabs).**
   `lib/nav/badges.ts` (`attentionBadges` + `launcherBadgeCount`, Vitest-locked) +
   shared `components/count-badge.tsx`; counts System→Errors, Clock-in→Review,
   Lesson Plan→History; capability-gated (super_admin = all), best-effort,
   non-reviewers run **zero** queries. Badge sits on the launcher icon corner + the
   matching tab. New queries `countTimesheetsForReview` / `countLessonPlansForReview`.
4. **#178 — DB cold-start resilience (not a backlog item; triaged from the error
   log).** The 17 `database init failed: Failed query: CREATE SCHEMA "drizzle"`
   errors were `migrate()`'s first statement failing under a **serverless cold-start
   connection storm** (compute waking / connection limit), self-healing on the next
   request but logged because `migrateWithFallback` only retried migration-RACE
   codes. Fix: `isTransientConnectionError` (`57P03`/`53300`/`ECONNRESET`/… —
   `lib/db/index.ts`) is now retried too; `serializeError` (`lib/observability.ts`)
   appends `Caused by: [code: …]` so the SQLSTATE on `err.cause` is finally captured.
   Both Vitest-locked.

**QA note:** A and B passed typecheck/lint/test/build + a `/code-review`/reviewer
pass, but were **NOT browser-QA'd (gstack)** this session — worth a real-device pass
(esp. A's multi-line lesson form + the badge placement on phones).

**Follow-ups for the NEXT session (carry these):**
- **DB errors — verify, then maybe root-cause.** #178 makes new cold-start errors
  self-heal (should stop appearing). **Re-check `/system/errors` in a day or two**;
  if clean, the old 17 can be cleared (operator "Clear all"). The *root* fix is an
  **operator env change** (NOT done yet): point `POSTGRES_URL` at the Neon **pooled**
  endpoint (`-pooler` host, Production + Preview) to remove the connection-storm
  class entirely.
- **Backlog C is START-HERE** (see below) — first confirm with the operator: center-
  assignment UI on `/system/users` vs `/system/permissions`.
- Backlog **D**, **E** still queued; Marketing-card visibility is a no-code operator toggle.

## This session (2026-06-13, continuation 2) — merged to `main` as #170–#172

Three PRs, each its own branch off `main`, all squash-merged after a `/code-review`
pass + gstack browser QA:

1. **#170 — Bulk add: overwrite-or-skip on existing emails.** When a CSV/Excel
   bulk-add overlaps existing emails, Create pops a dialog (Overwrite / Skip);
   pure Vitest-locked `lib/users/bulk-plan.ts` (`planBulkUsers`) decides
   create/overwrite/skip. Overwrite resets role + shared password (+ full name)
   but **never the actor's own account and only accounts the actor outranks**;
   server-authoritative via `listUsers`. `POST /api/users/bulk` takes
   `mode:"skip"|"overwrite"` (default skip); overwrites audited `user.bulk_update`.
2. **#171 — User-management list + self-service.** `/system/users`: **Linked
   Workforce sortable**; **filter bar** (Role / Active / Linked-vs-unlinked);
   **super_admin can edit a sign-in Email inline** (re-gated in the PATCH route;
   duplicate → clean 400). `EmployeeCombobox` **greys + locks a profile already
   linked to another account** (shows that account's email). `/account`
   self-service gained **Nickname** editing (full name + role stay admin-only;
   email/password still require the current password); `PATCH /api/users/me`
   accepts `newDisplayName`.
3. **#172 — Observability + DB constraint + confirm-email.**
   - **Route error boundaries** `app/error.tsx` + `app/global-error.tsx` (friendly
     retry, **self-report to `/api/errors`** — fills the gap that React render
     errors never reach `window.onerror`; global-error does a hard reload).
   - **Unseen-error badge** on the launcher **System** card (`countAppErrors`,
     super_admin only, clears on "Clear all"; guarded so a failing count can't
     crash the launcher).
   - **One-login-per-profile DB backstop**: partial UNIQUE index on
     `users.coach_id` AND `users.gym_staff_id` (WHERE NOT NULL). **Migration 0038**
     auto-dedups first — keeps the **ACTIVE** login per profile (else earliest),
     NULLs the rest, audited `user.dedup_links`; idempotent/re-run-safe;
     Vitest-locked (`db.test.ts`).
   - **Confirm-new-email**: a re-type "Confirm new email" field on `/account` +
     a confirm dialog when a super_admin rewrites a sign-in email in the user list.

Also this session (NOT a feature PR):
- **Pre-commit `/code-review` hook** added to the project (`.claude/settings.json`,
  `PreToolUse`/Bash): injects a reminder to run `/code-review` on the staged diff
  before any `git commit` (non-blocking). Lives in the repo so it persists.
- **gstack works in this sandbox** (the old "no Playwright" note is half-wrong) —
  see the bridge recipe under Environment notes.

## Open / in-progress — THE BACKLOG (operator decisions baked in)

> The operator queued these faster than they could be built; do them **one clean
> PR at a time**, in roughly this order. C and D overlap (both touch
> `/system/permissions`); B's counts get refined by C.

**A. Clock-in entry redesign — ✅ DONE (#175).** Shipped this session (see the
 continuation-3 block above). The implemented shape became the canonical reference
 in CLAUDE.md's Clock-in chapter; `sessionToEntries` + `parseTimesheetSession` are
 Vitest-locked. (Old `claude/clockin-entry-redesign` branch superseded — ignore.)

**B. Notification badges — ✅ DONE (#176).** Shipped this session (continuation-3
 block above). One source of truth `lib/nav/badges.ts` (`attentionBadges` +
 `launcherBadgeCount`) + shared `components/count-badge.tsx`; lights up launcher
 cards AND section-nav tabs. **C will add a center filter inside `attentionBadges`.**

**C. Center-scoped approvals — ✅ DONE (#180).** Shipped this session (see the
 2026-06-14 block above). Operator chose `/system/permissions` for the assignment UI;
 per-user only (no per-role center defaults); "select all centers" collapses to
 unrestricted; KPI runs are company-wide so center-restricted admins are blocked from
 review/finalize/reopen/delete entirely. `users.managedCenters` + migration 0039;
 pure helpers + queue filters Vitest-locked.

**F. Clock-in lesson session v2 (operator request 2026-06-14, with screenshots). ← NEXT, START HERE.**
 Refine the multi-line lesson session from #175 — touches `components/timesheet-entry.tsx`,
 `lib/timesheet/validate.ts` (`parseTimesheetSession`/`sessionToEntries`), the history
 list, and `components/timesheet-review.tsx`. Three asks:
 1. **One row per class type — no duplicates.** "Add class" should only offer types not
    already in the session (or merge a dup); to log 2 hours of one type the coach raises
    that row's number to 2, not a second identical row.
 2. **Label the per-row number as HOURS + note Young Swimmer = 0.5 h/class, others = 1 h.**
    The number already IS hours (the footer sums them: 1+1+1 = 3.00 h). Make it explicit
    with a "(hours)" label + helper note so coaches enter correctly (e.g. 2 Young Swimmer
    classes = 1 h). Probably allow 0.5-h steps; keep the ±0.25 h sum-vs-span gate
    (`SESSION_HOURS_TOLERANCE`). **Number = hours is operator-confirmed** (point 2 + the
    footer math) — don't flip it without a paid example.
 3. **Whole-window record + delete + approve.** Today a session persists as N lesson rows
    sharing (coachId, date, center, start, end); the history list (`/timesheets`) + review
    queue (`/timesheets/review`) show each line separately. The operator wants the **whole
    window as ONE displayed record**, and **coach delete + admin approve/request-changes to
    act on the entire window atomically** (delete all rows of the window; review all rows of
    the window together — `reviewTimesheets` currently flips by id). **Implementation choice:**
    group by the shared (coachId,date,center,start,end) key (no migration — verify two
    distinct sessions can't share that exact key) vs. add a `sessionId` column to
    `timesheets`. Keep the per-row classType+hours persistence (aggregation/reconcile read
    it). Engine/validator changes go through the pure Vitest-locked path (payroll).

**D. Permissions / User-overrides redesign (`/system/permissions`).** Six asks:
 1. show **Full Name** (not just nickname/email);
 2. **search + per-column sort/filter**;
 3. **bulk check/uncheck the filtered rows** at once;
 4. move the launcher-category control **off the Roles tab** — manage category
    visibility per-user (the Roles tab's categories can be removed);
 5. **rename "User overrides"** to something clearer;
 6. drop the **Visibility** column.
 **Operator confirmed 2026-06-14 (with screenshot):** the "User overrides" tab
 currently lists **203 accounts with NO search / sort / filter and NO
 select-all/clear** — and this applies to **BOTH** cards on the tab now: the
 category-overrides list AND the new **Center scope** card (#180, same
 controls-less pattern). Asks #2 (search + per-column sort/filter) and #3 (bulk
 check/uncheck the filtered rows = 一键勾选/取消) cover it. Build the controls on the
 **E kit** (`SearchInput`/`FilterBar`/`useRowSelection`/`SelectAllCheckbox`), so
 **E-kit lands before D**. (C is DONE — the per-admin center assignment landed on
 this page, so the page now hosts category + center per-user overrides.)

**E. List-control standardization (operator decision 2026-06-13: kit + docs FIRST,
 then per-module batches).** Standard to enforce: **every data list ships Search +
 Sort + Filter, plus select-all / clear where it has row checkboxes** — all via the
 shared `components/table-controls.tsx` kit, never a one-off `useState("")` +
 `.filter()`. Inventory baseline (this session's audit): 23 lists — search 8, sort 9,
 filter 6, select-all 2 (only `TimesheetReview` group-toggle + the `PermissionsForm`
 matrix). Existing reusable pieces: `useTableSort` / `SortTh` / `TableToolbar` /
 `includesText`. **What's one-off today and must be extracted:** search box, filter
 dropdowns, row-selection/select-all.
 - **PR-kit (first):** extend `table-controls.tsx` with `SearchInput` (icon +
   clear), `FilterBar` / `FilterSelect` (dropdowns + "clear filters"),
   `useRowSelection` (`Set<id>` + toggle + `selectAll`/`clear` + `allSelected`/
   `someSelected`), `SelectAllCheckbox` (tri-state). **Migrate the 2 existing
   select-all surfaces** (`components/timesheet-review.tsx`,
   `components/permissions-form.tsx`) onto the new hook as the reference impl.
   **Write the standard into `CLAUDE.md` Conventions** (the binding rule lands here,
   once the helpers exist — referencing real components, not aspirational ones).
 - **Then convert the ~15 missing lists in per-module batches** (one clean PR each),
   roughly: ① Allowance / Freelancer / Commission history (need search+sort+filter)
   ② `/progress` deliveries · `/system/audit` · `/system/errors` ·
   `/timesheets/schedules` (nearly all four missing) ③ `/lesson-plans/history`
   (needs search+sort) ④ KPI run detail (`RunCoachTable`) · `/staff/payees` (needs
   filter). Each batch is its own PR → `/code-review` + QA. **Synergy with D:** the
   Permissions-page redesign's "search + per-column sort/filter + bulk check/uncheck"
   asks should be built ON the same kit, so do PR-kit before D.

**G. Default-deny launcher categories + drop the Visibility column (operator request
 2026-06-14, with screenshot). Supersedes the old "Marketing visibility" item.**
 1. **Drop the "Visibility" column** from the User-overrides tab (= D ask #6 — do them
    together).
 2. **Flip category visibility to default-DENY.** Today `DEFAULT_PERMISSION_CONFIG.categories`
    grants **all three** (swim / fit / marketing) to every role, so everyone sees everything
    by default; the operator wants the default to be **nothing** — an admin must **manually
    tick a department** on the User-overrides tab before an account sees ANY launcher
    category.
    - **Code lever:** set the role-default categories to `[]` (decide per role; super_admin
      always all). The resolver is `effectiveCategories` (override ?? role default; super_admin
      → all) — flipping the role default to `[]` is the switch. This alone only affects FRESH
      seeds (prod already has a stored config).
    - **Existing prod (stored config + 203 accounts):** a hard flip locks out every
      *inheriting* account until granted. **Safe rollout (recommended):** a migration that
      **snapshots each account's CURRENT effective categories into a per-user override BEFORE**
      flipping the role default to `[]` — existing users keep their access, only NEW accounts
      default-deny. (Alt: hard flip + a bulk-grant pass.) Can ship independently of the D
      redesign (it's a config/migration change, not the UI rework).

**Carried over (largely handled, verify):** pre-#166 wrong auto-links — #172's
 DB UNIQUE now prevents new dupes and 0038 dedups existing ones (keeping the active
 login); **verify the dedup kept the intended links** and re-run AI auto-link for
 any orphaned active accounts. Real-device QA: A (#175) and B (#176) shipped this
 session but were NOT browser-QA'd; C/D/E are unbuilt → QA when built.

## Environment notes (Claude Code on the web)

- `npm install` + `npx next typegen` before `npm run typecheck`/`build` in a fresh
  container. PGlite backs tests (`memory://`); run `npm run db:generate` after a
  schema change. **Migrations run to 0038.**
- **gstack DOES run here** (the binary is prebuilt; `bun` present). gstack's bundled
  Playwright wants Chromium rev **1208** but the sandbox ships rev **1194** at
  `/opt/pw-browsers`, and `npx playwright install` is network-blocked. Bridge it:
  `mkdir -p /opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64`,
  `ln -sf /opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
  …/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell`,
  `touch …/chromium_headless_shell-1208/{INSTALLATION_COMPLETE,DEPENDENCIES_VALIDATED}`,
  then run the binary with **`CI=1`** (bumps the 8s→30s startup wait; `--no-sandbox`
  auto-added for root). Drive: start `npm run dev`, log in `admin@local` / `swim123`,
  `$B goto … / snapshot -i / fill / click / upload <sel> <file> / screenshot`. Note a
  fresh daemon resets `@e` refs — `snapshot` in one step, `fill/click` in the next.
- Merging via the GitHub MCP API **bypasses branch protection** here (admin);
  still confirm CI green first. **Force-push is blocked** → fresh branch + new PR per
  change; after a squash-merge, cut the next branch from fresh `origin/main` (fetch).
- A project **pre-commit hook** (`.claude/settings.json`) injects a `/code-review`
  reminder on `git commit` — review the staged diff before committing.

## Earlier history (already on `main`)

- **2026-06-13 continuation 1 (#164–#168):** Users page overhaul + bulk-add via
  file upload; KPI auto-compute Phase 1 (`buildRunCoaches`, draft-only) pulling the
  WORK month's Allowance run; auto-link precision rewrite + `sharesNameSignal`;
  readable `EmployeeCombobox`; ingest push as one JSON object (`csv` field).
  Decisions: compute is NEVER automatic on upload/push; bulk/AI names key off the
  **Full Name**.
- **Clock-in / Timesheet** module built end-to-end (P1–P4) — see the CLAUDE.md
  chapter. Freelancer schedule carries no class type; reconcile matches on date only.
- **Prod DB outage fix** (`lib/db/index.ts`): concurrent-race retry,
  `reconcileSchema` skips "already exists"/"already gone" + `DROP COLUMN IF EXISTS`,
  journal backfill. Idle auto-logout, in-app error log, vendored skills.
