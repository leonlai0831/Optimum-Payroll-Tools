# Roadmap

Working notes for in-flight initiatives — enough for a fresh session (or a
teammate) to pick up without replaying chat history. `main` is the source of
truth; this file only records **intent** and **what's left**.

## Gym-staff module → Swim-School staff parity — ✅ COMPLETE

Brought the Optimum Fit gym-staff module (`/commission/staff`) up to the same
shape as the Swim-School staff module (`/staff`): **directory + profile + HR
notes + audit + login links** — **no appraisals** (as agreed with the owner).

### Architecture decisions (kept, for reference)

- Gym data stays **isolated** from the test-locked Swim HR tables: gym notes live
  in their own `gym_notes` table (not a polymorphic generalization of `notes`),
  mirroring how `gym_staff` is already separate from `coaches`.
- **UI is shared, data is separate**: Swim components like `NotesTimeline` are
  parameterized (`subjectId` + `createUrl` / `deleteBase`) so both modules render
  the same UI against their own routes/tables.

### Done (all merged)

- Phase 1 — searchable / filterable / sortable directory — #50
- Phase 2 — per-staff profile page (editable Details + Earnings) — #51
- Phase 3 — HR notes timeline (`gym_notes`, gated by `edit_notes`, audited) — #52
- Phase 4 — link a `gym_staff` row to a `users` login + role, in Staff → Users — #57
- Phase 5 — gym-staff create/update/delete + note create/delete write to the
  shared `audit_log` (surfaced at `/staff/audit`) — confirmed wired
- CI — full suite on every PR as a visible `test` check — #53
- Tests — HTTP smoke covers the gym-staff directory/profile/notes + login-link
  flow (browser-free) — #54, #57

## No active initiative

The parity work above is closed. Other things shipped to `main` recently (no
follow-up owed):

- **KPI CSV** — `TTL-LVL` accepted as the Total Student header — #58
- **Pay-tier role rule** — a Swim coach's job role is **derived from the pay tier**
  (A1/A2/A3 → Front Desk, else Instructor), not hand-set; the staff directory
  edits Type / Pay tier / Active / Center inline. Existing rows corrected by
  migration `0016` (applies on deploy) — #59
- **Browser E2E re-gated** — the Playwright suite is green and **gating** again
  (`continue-on-error` dropped); the `kpi-upload` spec was updated for the
  allowance-gated leaderboard — #60
- **Section-nav flicker fixed** — the KPI/Staff section nav renders in a section
  `layout.tsx` (like commission already did), so it persists across
  sub-navigation and permission-gated tabs no longer flicker out on load — #60
- **Optimum Fit earnings** — the commission + coaching-income calculators were
  dogfooded end-to-end on real exports (compute → report → save → History/Trends)
  with no defects. Data note: commission "unattributed sales" are simply source
  rows exported with a blank `staff_code`.

Pick the next initiative from the owner or from `HANDOFF.md`'s suggestions.
