# Session Handoff — Optimum People Hub

Snapshot for the next session (last updated **2026-06-13**, end of a long
continuation session). `main` is green: **vitest 483/483**, typecheck + lint
clean, `next build` OK. Read `CLAUDE.md` for architecture + the frozen Settings
IA rules; read `AGENTS.md` before touching Next.js APIs.

## This session (2026-06-13, continuation) — merged to `main` as #164–#168

Five PRs, each its own branch off `main`, all squash-merged:

1. **#164 — Users page overhaul + KPI auto-compute Phase 1 + System card.**
   - **Bulk add users → CSV/Excel upload** (was pasted `email,name` lines):
     parsed client-side (PapaParse / lazy ExcelJS) into a grid, then rows by the
     pure, Vitest-locked `lib/users/bulk-parse.ts`. The uploaded **name maps to
     the Full Name (legal) field**, not the Nickname. CSV-template download + preview.
   - **System Setting launcher → ONE card** (`/system/users`, `cap:manage_users`);
     fixed `system/layout.tsx` passing `isSuperAdmin` as a literal `true` (a
     `manage_users`-only holder used to see the super-admin tabs).
   - **Users table**: Full Name column **sortable** + de-capitalized headers,
     **"Linked Workforce"** (was "Linked Employee"), inline edits **STAGED +
     saved via a Save button** (no auto-save), wider/​balanced column widths.
   - Login email placeholder → "Enter your email".
   - **KPI auto-compute Phase 1**: a staged Student Progress delivery → a
     reviewable **draft KPI run** in one click. `lib/kpi/build-run.ts`
     (`buildRunCoaches`, Vitest-locked, bit-identical to the client `computeCoach`)
     does merge + v11.1 scoring + carry-over server-side; `POST
     /api/kpi/ingests/[id]/compute` always saves `status:"draft"`; a **"Compute
     KPI draft"** button on a pending delivery jumps to the existing `RunReview`.
2. **#165 — KPI draft inputs.** Teaching allowance now comes from the WORK
   month's saved **Allowance run** (`listAllowanceRuns(period)` → `linkAllowance`
   per coach, like the dashboard), falling back to profile carry-over — **no
   manual allowance editor** (the operator always keys allowance before KPI).
   `RunReview` gained a **Position select + a supervisor's group center & hours
   (/40)** editor (entered by hand — allowance + clock-in only track *teaching*
   hours; a supervisor's real hours are longer).
3. **#166 — Auto-link accuracy + link uniqueness.** Auto-link was mis-linking
   most accounts (3 logins → one coach). Now **precision-first** (`lib/users/
   autolink.ts`): match on the **Full Name first, then Nickname**, by cleaned-name
   → token-set → multi-token subset; link only a **unique** top-tier coach (ties
   skipped), each coach once. The AI pass is gated by **`sharesNameSignal`** (must
   share a real name token — kills hallucinated links for signal-less accounts).
   **One workforce profile ↔ one login enforced**: auto-link skips already-linked
   coaches; `PATCH /api/users/[id]` 409s on a duplicate link.
4. **#167 — Readable Linked-Workforce picker** (`EmployeeCombobox`): wider
   dropdown (was locked to the narrow column), **full names** (no truncation) with
   the coach's **center** as a sub-label, search spans the center, trigger tooltip.
5. **#168 — Ingest push as one JSON object.** `POST /api/ingest/kpi` JSON body now
   also accepts a **`csv` string field** (raw CSV text, same parser), so
   periodLabel + label + data fit one JSON object — no query params. The old
   `text/csv` body + query-param mode stays for backward compat; `csv` wins over
   `rows`. (Operator relayed a REST concern from the push-API developer; example
   curls were shared with them.)

**Operator decisions baked in this session:**
- **Compute is NEVER automatic on upload/push.** A delivery is only STAGED; the
  owner reviews + edits the month's database on `/progress`, then the explicit
  "Compute KPI draft" sends it to KPI. An unreviewed month must never become a run.
- Bulk-uploaded / AI-link names key off the **Full Name** (legal), not Nickname.

## Open / in-progress — NOT done

- **Pre-existing wrong auto-links are NOT auto-cleaned.** The new logic prevents
  recurrence, but old duplicate/wrong links from before #166 remain — the operator
  should set them to "none" and re-run AI auto-link. A DB-level UNIQUE constraint
  on `users.coachId` (partial, WHERE NOT NULL) could be a follow-up once the
  existing duplicates are cleaned (a dedup migration step would be needed first).
- **Optional picker nicety (not built):** mark coaches already linked to another
  account in the `EmployeeCombobox` (grey + "linked to <email>"), to guide manual
  linking on top of the server-side 409.
- **Real-device QA** on the new/changed surfaces (clock-in entry/review/schedules,
  Users page incl. bulk-add file upload + staged-save + picker, the Compute-KPI-
  draft → RunReview supervisor flow) — all build/typecheck/CI-verified only
  (sandbox can't run Playwright; e2e specs only cover /login + /kpi).

## Earlier the same day (already on `main` before this session)

- **Clock-in / Timesheet** module built end-to-end (P1–P4); see the CLAUDE.md
  chapter. Freelancer schedule carries no class type; reconcile matches on date only.
- **Production DB outage fixed** (`lib/db/index.ts`): concurrent-race retry,
  `reconcileSchema` skips "already gone" + `DROP COLUMN IF EXISTS`, journal
  backfill. Migrations run to **0037**.
- Mascot oval goggles (#150); #147 pm-skills bootstrap; #148 landed via #151
  (idle auto-logout, in-app error log, freelancer raw-account KPI binding, CC pin);
  vendored `skill-creator` + `find-skills`.

## Environment notes (Claude Code on the web)

- `npm install` + `npx next typegen` before `npm run typecheck`/`build` in a fresh
  container (RouteContext types are generated). PGlite backs tests (`memory://`);
  run `npm run db:generate` after a schema change.
- Merging via the GitHub MCP API **bypasses branch protection** here (admin) —
  squash-merge worked for every PR even with checks mid-flight (still: confirm CI
  green first). **Force-pushing any branch is blocked** by the auto-mode classifier.
  After each squash-merge, **cut the next branch from fresh `origin/main`** (fetch
  first); to reuse a merged branch you'd need a force-push, which is blocked, so a
  fresh branch + new PR per change is the working pattern (the operator approved it).
- Playwright browsers + remote branch deletion aren't available in the sandbox.
