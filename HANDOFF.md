# Session Handoff — Optimum People Hub

Snapshot for the next session (last updated **2026-06-14**). `main` is green:
**vitest 546/546**, typecheck + lint clean, `next build` OK. Read `CLAUDE.md` for
architecture + the frozen Settings IA rules (it now opens with a TOC + a
"Non-negotiable rules" quick-ref); read `AGENTS.md` before touching Next.js APIs.

## This session (2026-06-14, continuation 7) — E batch ① + system review → ROADMAP P2 + IDOR fix (#191–#193)

Three PRs, each its own branch off `main`, all squash-merged after `/code-review`
+ green CI (+ gstack QA where there was a UI surface):

1. **#191 — Backlog E step 2, batch ①.** Migrated the three saved-month **history**
   lists onto the `components/table-controls` kit: `AllowanceHistoryView` (raw
   Input/Select → `SearchInput`/`FilterBar`/`FilterSelect` + Clear-filters),
   `FreelancerHistoryView` (added Search + Position filter + per-column `SortTh`
   over each period group + empty-after-filter state), and `RunHistoryShell`
   (powers **Commission + Coaching** history — added Search + Year filter +
   per-column sort incl. one key per dynamic stat column + empty state). No data
   behavior change; grouping + newest-first default order preserved.
   **gstack-QA'd** (phone 390px + desktop 1280px, seeded data): search, all
   filters, Clear, sort asc→desc by row order, year filter, empty state — zero bugs.
2. **#192 — System review → ROADMAP P2 (docs only).** Operator asked for a
   four-dimension review (product / code-quality / UI-UX / security) and to fold
   **every** finding into the plan with an agent-decided order. Ran 4 parallel
   review agents; consolidated + de-duped into **`ROADMAP.md` → P2** with a
   12-step execution order (correctness + security first → high-value product →
   cleanup), integrated with the in-flight E rollout + P0 go-live. Two items
   flagged for an **owner decision** (outbound notifications; bulk-overwrite
   password-reset blast radius).
3. **#193 — P2 #1: lesson-plan center-scope IDOR fix (security, confirmed).**
   `GET /api/lesson-plans/[id]` + the PDF route only checked `canViewPlan`, which
   returned true for ANY reviewer regardless of center — a center-scoped reviewer
   could read/export plans outside their centers. Made `canViewPlan` center-aware
   (creator always sees own; reviewer only via `canManageCenter`, `null` =
   unrestricted/super_admin unchanged). New `lib/lesson-plan/access.test.ts`
   (7 cases; **vitest 539→546**). Pure lib + API behavior, no rendered surface →
   browser QA N/A per the SOP.

**Next build item: ROADMAP P2 order, resuming at #2** — `allowance-calculator`
**stable-`_key` fix** (a confirmed correctness bug surfaced by the review:
editable teaching/other rows reconcile by **array index**, ~L117-141, violating
the project's stable-`_key` rule — removing a middle row shifts focus/values to a
neighbour; freelancer already does it right). It's a **UI** change → needs a real
gstack browser-QA pass. Then continue down the P2 list (payroll-correctness
guards, payee PII scoping, monthly-close dashboard, allowance bank XLSX, then the
remaining **E batches ②③④** folded in as P2 #7, code/UI cleanup, larger refactors).

**Follow-ups (carry):**
- **The full P2 backlog + ordered plan now lives in `ROADMAP.md`** — that's the
  source of truth for "what's next"; the per-finding detail is there.
- Still NOT browser-QA'd from earlier sessions: **A (#175), B (#176).**
- **DB cold-start (operator env change, NOT code):** point `POSTGRES_URL` at the
  Neon **pooled** (`-pooler`) endpoint; re-check `/system/errors` is clean + clear old rows.
- **gstack bridge re-verified working this session** (rev 1208→1194 symlink + `CI=1`);
  the seed-then-QA pattern (insert rows via a throwaway `tsx` script against `./.pglite`
  while dev is stopped, then drive the UI) worked well for control-less lists.

## This session (2026-06-14, continuation 6) — Backlog D + G shipped (#188, #189)

Two full build→`/code-review`→test→gstack-QA→merge cycles on the
`/system/permissions` page; **migrations now run to 0040**.

1. **#188 — Backlog D (list-controls).** The overrides tab (renamed **"User
   overrides" → "Per-account access"**) now ships, on BOTH cards
   (`category-overrides.tsx` + `center-overrides.tsx`), the standard kit:
   **Full Name** in the identity cell, **Search + per-column Sort + Role/state/
   Status Filter**, **select-all** (desktop header + a mobile select-all row) and
   a **bulk action bar** (一键勾选/取消 — bulk grant/revoke a category or center, or
   reset, across the *visible* selection). Built on the E kit (#186). `/code-review`
   caught two real bugs, both fixed: ① bulk **partial-failure reverts only the
   failed rows** (the optimistic `overrideById` is mount-seeded, `router.refresh()`
   can't reconcile it, so reverting succeeded rows showed stale data); ② **"N
   selected" is scoped to rows visible under the current filter** (was counting
   filter-hidden selections). Covers D asks #1/#2/#3/#5.
2. **#189 — Backlog G + D#4/#6 (default-deny categories).** Launcher visibility
   flipped from all-three-by-default to **DEFAULT-DENY**: a new account sees no
   department until a super_admin grants one per-account.
   - `DEFAULT_PERMISSION_CONFIG.categories` → `[]` per role; `normalizePermissionConfig`
     now resolves a missing/invalid role entry to `[]` (deny), **not** all-three.
   - **Migration 0040** = the safe rollout: in **one atomic data-modifying CTE**,
     snapshot each inheriting account's CURRENT effective categories into a per-user
     override, THEN flip the stored role defaults to `[]` — existing accounts keep
     access, only NEW accounts default-deny. Audit once (`NOT EXISTS` guard);
     reconcile-replay-safe (a new NULL account on replay reads the now-`[]` default →
     stays denied). `/code-review` (high) flagged 3 migration/resolver issues — all
     fixed (deny fallback, once-only audit, atomic CTE). Verified on populated data
     via a standalone PGlite harness (since deleted) AND in the browser.
   - **D#4:** Roles tab no longer edits per-role categories (capabilities only).
     **D#6:** the category card is now **direct-edit** checkboxes — Override/Reset/
     inherit machinery + the Visibility column removed; the state filter became an
     **Access (has/none)** filter.

**Both browser-QA'd** (gstack, phone 390px + desktop 1280px): D — search 6→1, all
filters + clear, sort, full-name sub-line, select-all (both layouts), bulk
revoke/restrict persisted; G — after migration the pre-existing accounts kept
all-three (as overrides), a freshly-created account is default-deny, direct-edit
persists, Roles tab has no category section.

**Follow-ups (carry):**
- **Backlog D & G are DONE** — `/system/permissions` is fully reworked. **C (#180)
  Center-scope UI was QA'd last session.**
- **Next build item: E step 2** — convert the remaining ~15 control-less lists onto
  the kit in per-module batches (one PR each): ① Allowance/Freelancer/Commission
  history ② `/progress` · `/system/audit` · `/system/errors` · `/timesheets/schedules`
  ③ `/lesson-plans/history` ④ KPI run detail (`RunCoachTable`) · `/staff/payees`.
  All safe/additive, no operator decision needed.
- **DB cold-start (operator env change, NOT code):** point `POSTGRES_URL` at the Neon
  **pooled** (`-pooler`) endpoint; re-check `/system/errors` is clean and clear old rows.
- Still NOT browser-QA'd from earlier sessions: A (#175), B (#176).

## This session (2026-06-14, continuation 5) — Center-scope UI QA'd + Backlog E kit shipped (#186)

Short session, one build PR + one carried QA, both done by the loop (`/code-review`
+ green CI + gstack browser QA):

1. **#180 Center-scope UI — browser-QA'd (the carried follow-up).** Drove the
   `/system/permissions` "User overrides" → **Center scope** card in gstack at phone
   width (390px) AND desktop: Restrict → reveal the 9 configured-center chips → select
   (PATCH 200, badge "Manages 1 of 9", chip turns indigo) → add a 2nd (persists across
   reload) → **select all 9 collapses to NULL** server-side ("Manages all centers" after
   reload) → **Reset to all** (PATCH null). super_admin row locked. Both responsive
   layouts render. **Zero bugs** — #180 is now QA-clean.
2. **#186 — Backlog E: list-control PR-kit (first step).** Extended
   `components/table-controls.tsx` with **`SearchInput`** (icon + clear, composes
   `ui.tsx` `Input`), **`FilterSelect` / `FilterBar`** (dropdown filters + "Clear
   filters", composes `ui.tsx` `Select`), **`useRowSelection`** (`Set<id>` +
   `toggle`/`toggleMany`/`selectOnly`/`clear` + `stateOf`/`allSelected`),
   **`SelectAllCheckbox`** (tri-state) and the pure **`triState`**. **Migrated
   `components/timesheet-review.tsx`** onto the hook as the reference impl + added a
   top-level "Select all records"; per-coach-group/per-window boxes now show a correct
   **indeterminate** state (was unchecked-until-all). Pure helpers Vitest-locked in
   `components/table-controls.test.ts` (**+15 → 538**). CLAUDE.md Conventions records the
   list-control standard. **gstack-QA'd** the review queue (window grouping 4 rows → 3
   records, tri-state, Approve → queue empties). **`permissions-form.tsx` was judged NOT
   applicable** (its "matrix" is a 2-D role×capability config grid, not id-based row
   selection — `useRowSelection` doesn't fit; a per-column "check all caps" belongs to D).

**Follow-ups (carry):** the **E kit is now in `main`**, so the two things that build on
it are unblocked. Next build items: **D (Permissions-page redesign)** — add
search/sort/filter + bulk check/uncheck to BOTH overrides cards (category + center) on
`/system/permissions`, built on the E kit; **G** (default-deny categories + drop the
Visibility column — pairs with D ask #6); and **E step 2** — convert the ~15 control-less
lists in per-module batches (one PR each) onto the kit (Allowance/Freelancer/Commission
history → `/progress` · `/system/audit` · `/system/errors` · `/timesheets/schedules` →
`/lesson-plans/history` → KPI run detail · `/staff/payees`). Still NOT browser-QA'd: A
(#175) and B (#176) from earlier sessions. DB cold-start: re-check `/system/errors` is
clean, then the operator points `POSTGRES_URL` at the Neon **pooled** endpoint.

## This session (2026-06-14, continuation 4) — F shipped, gstack-QA made mandatory, CLAUDE.md restructured (#182–#184)

Three PRs, each its own branch off `main`, all squash-merged after `/code-review`
+ green CI (and, for the UI one, a real gstack browser QA):

1. **#182 — Backlog F: clock-in lesson session v2.** Refined the multi-line lesson
   session from #175. ① **One row per class type** — the form's type dropdown only
   offers unused types, "Add class" disables once all 7 are used, and
   `parseTimesheetSession` merges duplicate class types (summing hours) as the
   server backstop. ② Per-line number labelled **hours** + a note (each class = 1 h,
   Young Swimmer = 0.5 h/class); 0.5-h steps; ±0.25 h sum-vs-span gate kept. ③ The
   clocked window is **ONE record**: new pure, Vitest-locked `groupSessionWindows`
   (`lib/timesheet/group.ts`) collapses the per-line rows back into the window for
   the coach's list AND the reviewer's queue; the coach's delete (new bulk
   `DELETE /api/timesheets` `{ ids }` → `deleteTimesheetEntries`) and the reviewer's
   approve/request-changes act on the **whole window together**. No `sessionId`
   column — grouped by (date,center,start,end[,status]); persistence stays one row
   per class line, so payroll aggregation/reconcile are untouched. CLAUDE.md
   Clock-in chapter + ROADMAP updated in-PR. **vitest 517→523** (+6: dedup-merge +
   window grouping).
2. **#183 — gstack browser QA is now MANDATORY (operator instruction).** The SOP's
   "browser QA when it warrants" was the loophole that let F nearly merge unQA'd.
   SOP step 1 now requires a gstack QA for EVERY PR touching a user-facing surface
   before merge; only no-render changes (lib/db/types/docs) may skip it. Step 2
   (auto-merge) lists the passed QA alongside green CI as a gate.
3. **#184 — CLAUDE.md restructure (operator request).** Added a TOC + a
   "Non-negotiable rules (read first)" 10-rule quick-ref at the top; moved the long
   Design-language narrative to **`docs/design-notes.md`** (summary + pointer kept)
   and Divergences to a new **`docs/DECISIONS.md`** (settled-history archive);
   trimmed the stale intro backlog enumeration to a HANDOFF/ROADMAP pointer.

**F WAS browser-QA'd this session** (gstack, phone width 390px): created a test
coach + linked admin to it via API (`PATCH /api/users/[id] {coachId}` — the
`EmployeeCombobox` selects on **mousedown**, so a headless `.click()` doesn't
register; link via the API, it's not part of F), then drove the form end-to-end —
dropdown dedup, Add-class disabling at 7, 0.5 step, sum-vs-span gate, list/review
window grouping (1 record, 1 checkbox), approve flips the whole window, and
whole-window delete removed only the draft window's rows. **Zero bugs.**

**Follow-ups (carry):** the Center-scope UI (#180) and A/B from earlier sessions
are still NOT browser-QA'd — do those next (the gstack recipe below is verified
working). DB cold-start: re-check `/system/errors` is clean, then the operator
points `POSTGRES_URL` at the Neon **pooled** endpoint. Next build items:
**E (list-control PR-kit)** before **D** and **G** (both build on the E kit).

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

**F. Clock-in lesson session v2 — ✅ DONE (#182).** Shipped + browser-QA'd this
 session (see the continuation-4 block at the top). One row per class type (form
 dedup + server merge in `parseTimesheetSession`), the per-line number labelled
 hours (Young Swimmer 0.5 h/class, 0.5 steps), and the clocked window is ONE
 record across the coach's list + reviewer's queue + delete + approve via the pure,
 Vitest-locked `groupSessionWindows` (`lib/timesheet/group.ts`) + bulk
 `DELETE /api/timesheets`. Chose group-by-window-key (no `sessionId` migration);
 persistence stays one row per class line so payroll is untouched.

**D. Permissions / "Per-account access" redesign — ✅ DONE (#188 + #189).** All six
 asks shipped: #1 Full Name, #2 search + per-column sort/filter, #3 bulk
 check/uncheck (一键勾选/取消), #5 rename "User overrides" → "Per-account access"
 (#188); #4 category control removed from the Roles tab + #6 Visibility column
 dropped (the category card is now direct-edit checkboxes) (#189, with G). Built on
 the E kit.

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

**G. Default-deny launcher categories + drop the Visibility column — ✅ DONE (#189).**
 `DEFAULT_PERMISSION_CONFIG.categories` → `[]` per role (super_admin always all);
 `normalizePermissionConfig` resolves a missing/invalid role entry to `[]` (deny).
 **Migration 0040** does the safe rollout in one atomic CTE: snapshot each inheriting
 account's current effective categories into a per-user override, THEN flip the stored
 defaults to `[]` (existing accounts keep access; new accounts default-deny; audited
 once; reconcile-replay-safe — verified on populated data + in the browser). Roles tab
 no longer edits categories; the per-account card is direct-edit (Visibility column gone).

**Carried over (largely handled, verify):** pre-#166 wrong auto-links — #172's
 DB UNIQUE now prevents new dupes and 0038 dedups existing ones (keeping the active
 login); **verify the dedup kept the intended links** and re-run AI auto-link for
 any orphaned active accounts. Real-device QA: A (#175) and B (#176) still NOT
 browser-QA'd (C/D/G are now QA'd + shipped). **E step 2** is the next build item.

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
  `$B goto … / snapshot -i / fill / click / upload <sel> <file> / screenshot`.
  **Verified working 2026-06-14** (drove all of F's QA). Gotchas learned: `@e` refs
  only live **within one Bash call** — each new `$B` invocation after a re-render
  drops them, so do `snapshot -i` + the `fill`/`click` that use its refs in the
  **same** bash command; for a repeated action (click a button N times, with a
  re-render between each) drive it as `$B js "[...].find(b=>/Add class/.test(b.textContent)).click()"`
  (re-queries the live DOM). A custom widget that selects on **mousedown** (e.g.
  `EmployeeCombobox`) ignores a JS `.click()` — dispatch real mouse events, or for
  QA *setup* just hit the API (e.g. link a login↔coach with
  `PATCH /api/users/[id] {coachId}`, seed via `fetch` in `$B js`). The two
  responsive layouts both render in the DOM (CSS hides one), so DOM counts double —
  assert per-layout.
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
