# Roadmap

Working notes for in-flight initiatives — enough for a fresh session (or a
teammate) to pick up without replaying chat history. `main` is the source of
truth; this file only records **intent** and **what's left**.

## Gym-staff module → Swim-School staff parity

Bring the Optimum Fit gym-staff module (`/commission/staff`) up to the same shape
as the Swim-School staff module (`/staff`). Scope agreed with the owner:
**directory + profile + HR notes + audit + login links** — **no appraisals**.

### Architecture decisions (don't re-litigate)

- Gym data stays **isolated** from the test-locked Swim HR tables: gym notes live
  in their own `gym_notes` table (not a polymorphic generalization of `notes`),
  mirroring how `gym_staff` is already separate from `coaches`.
- **UI is shared, data is separate**: Swim components like `NotesTimeline` are
  parameterized (`subjectId` + `createUrl` / `deleteBase`) so both modules render
  the same UI against their own routes/tables.

### Done (merged)

- Phase 1 — searchable / filterable / sortable directory — #50
- Phase 2 — per-staff profile page (editable Details + Earnings) — #51
- Phase 3 — HR notes timeline (`gym_notes`, gated by `edit_notes`, audited) — #52
- CI — full suite on every PR as a visible `test` check — #53
- Test — HTTP smoke covers the gym-staff flow (gating, browser-free) — #54

### Remaining

- **Phase 4 — login links**: let a `gym_staff` row link to a `users` account +
  role (mirrors how Swim coaches link to logins). Org-wide users/permissions
  already exist; this adds the per-record link.
- **Phase 5 — audit**: mostly already wired — gym staff update/delete and note
  create/delete write to the shared `audit_log` (surfaced at `/staff/audit`).
  Confirm the gym-staff **create** path is audited too; otherwise small.

### To continue in a new session

> Continue the gym-staff ↔ Swim parity work. Phases 1–3 + CI + smoke are merged
> to `main`. Next: Phase 4 = link a `gym_staff` record to a `users` account +
> role. Keep gym data isolated; reuse/parameterize the Swim UI.
