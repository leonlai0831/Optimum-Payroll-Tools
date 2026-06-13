# Session Handoff — Optimum People Hub

Snapshot for the next session (last updated **2026-06-13**, end of a long
continuation session). `main` is green: **vitest 493/493**, typecheck + lint
clean, `next build` OK. Read `CLAUDE.md` for architecture + the frozen Settings
IA rules; read `AGENTS.md` before touching Next.js APIs.

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

**A. Clock-in entry redesign — branch `claude/clockin-entry-redesign` (pushed, NOT merged).**
 - DONE: `parseTimesheetSession` + `SESSION_HOURS_TOLERANCE` (±0.25 h) in
   `lib/timesheet/validate.ts`, Vitest-locked (`validate.test.ts`, 12 pass).
 - **#1 auto-mode (by position):** `app/(app)/timesheets/page.tsx` should fetch the
   signed-in user's coach `jobRole` (`getCoach(user.coachId)`) and pass it to
   `components/timesheet-entry.tsx`, which **locks the mode** —
   `jobRole === "front_desk"` → Front-desk Shift, else → Lesson — and **drops the
   free Lesson/Shift toggle**.
 - **#2 lesson session (start/end + multiple class lines):** `POST /api/timesheets`
   should accept a lesson session `{ periodLabel, date, center, startTime, endTime,
   lines: [{classType, hours}], note }`, validate via `parseTimesheetSession`, and
   **insert one timesheet row per line** (the `timesheets` table already has
   startTime/endTime/classType/hours cols — no schema change); keep the shift path
   (`parseTimesheetEntry`). Redesign the lesson form into a **multi-line
   (classType, hours) editor** with start/end + a live "sum vs span" indicator that
   blocks submit unless within ±0.25 h.
 - Decisions: multi-class-type per window; ±0.25 h tolerance; mode auto-locked by
   `coaches.jobRole` (`"instructor" | "front_desk"`).

**B. Notification badges — launcher cards AND section-nav tabs (MERGED, operator
 decision 2026-06-13).** A red count on each module card's **ICON top-right**
 (phone-notification style) for items awaiting *this user's* approval **AND** the
 same count on the matching tab once you open the section, so you know where to
 look. Awaiting-review sources: **Clock-in** = timesheets `submitted`
 (`review_timesheet`) → card + `/timesheets/review` tab; **Lesson Plan** = plans
 `submitted` (`review_lesson_plans`) → card + `/lesson-plans/history` tab;
 **System** = `countAppErrors()` (super_admin) → card + `/system/errors` tab
 (today the errors badge only lives on the card). Build it ONCE:
 - **`lib/nav/badges.ts` → `sectionBadges(user, caps)`** returns `Record<href,
   number>` (capability-gated for the current user). New queries needed:
   `countTimesheetsForReview()` (status `submitted`), `countLessonPlansForReview()`
   (status `submitted`); errors reuses `countAppErrors()`.
 - **Extract `<CountBadge>`** from the inline red-pill markup in
   `app/(app)/page.tsx` (`ToolCard`) into a shared component; launcher card AND
   `SectionNav` tab both render it (style never drifts). **Reposition the existing
   System-card badge** to the icon corner to match.
 - **`SectionNav` gains an optional `badges?: Record<string, number>` prop**
   (`components/section-nav.tsx`); each section `layout.tsx` (system / timesheets /
   lesson) computes via `sectionBadges` and passes it in. The launcher card badge =
   the sum of that section's destination counts.
 - Capability-gated; **super_admin sees all**; counts become **center-scoped once C
   lands** (add the center filter inside `sectionBadges`). The `Tool.badge` +
   `ToolCard` infra already exists in `app/(app)/page.tsx` (today next to the
   chevron). (Absorbs the old "launcher badges only" item.)

**C. Center-scoped approvals (admin approves only their branch).** super_admin = all
 (confirmed by operator). Full code map done this session:
 - Store `users.managedCenters` (jsonb `string[]`, mirror `visibleCategories`;
   NULL/empty → role default; super_admin → all). Add per-role defaults to
   `PermissionConfig` + an `effectiveAdminCenters()` resolver in `lib/auth/types.ts`;
   expose on `CurrentUser` in `lib/auth/session.ts`.
 - Assign on `/system/users` (or the Permissions page) — multi-select of
   `AllowanceConfig.centers`.
 - Enforce by **filtering review queues by the request's center**: timesheet review
   (`timesheets.center`, `app/api/timesheets/review` + `listTimesheetsForReview`),
   lesson-plan review (`lessonPlans.center`, `app/api/lesson-plans`), and **validate
   on KPI finalize** (`coaches.center`, `app/api/runs/[id]`). Center fields already
   exist on every entity.

**D. Permissions / User-overrides redesign (`/system/permissions`).** Six asks:
 1. show **Full Name** (not just nickname/email);
 2. **search + per-column sort/filter**;
 3. **bulk check/uncheck the filtered rows** at once;
 4. move the launcher-category control **off the Roles tab** — manage category
    visibility per-user (the Roles tab's categories can be removed);
 5. **rename "User overrides"** to something clearer;
 6. drop the **Visibility** column.
 (Overlaps C — the per-admin center assignment likely lives on this same page.)

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

**#3 Marketing visibility — owner action, NO code.** Swim staff see the "Optimum
 Marketing" card because `DEFAULT_PERMISSION_CONFIG.categories` grants **all three**
 categories to every role and the Marketing KPI card has **no capability gate**.
 Owner unticks "Optimum Marketing" for staff/supervisor on
 `/system/permissions → Role defaults`. (If a code default is wanted later: drop
 `marketing` from the role defaults so it's opt-in.)

**Carried over (largely handled, verify):** pre-#166 wrong auto-links — #172's
 DB UNIQUE now prevents new dupes and 0038 dedups existing ones (keeping the active
 login); **verify the dedup kept the intended links** and re-run AI auto-link for
 any orphaned active accounts. Real-device QA: this session gstack-QA'd #170/#171/#172
 surfaces; the clock-in redesign (A) and C/D are unbuilt → QA when built.

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
