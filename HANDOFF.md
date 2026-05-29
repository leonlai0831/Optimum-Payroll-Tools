# UX Rebuild — Phase 3 Handoff

PR #2 (`claude/laughing-wright-Zj9Ri`) is partway through a UX blueprint
rollout. Phases 1, 2, and 4 are landed. Phase 3 (the pattern rollout) is
mostly done; a handful of inline-error → Toast migrations remain. This
file is the contract between the session that started the work and the
session that finishes it — read it before opening Phase 3 again.

The full blueprint was authored in `/root/.claude/plans/async-bubbling-canyon.md`
but that path is in an ephemeral container and is gone on a fresh
session. The condensed version lives here, plus the rules from
`CLAUDE.md → Settings IA — frozen rules`.

---

## North star

**Make the right thing obvious; make every page feel like the last one.**
This is a low-traffic internal payroll tool. Trust comes from
predictability — identical headers, identical save behavior, identical
empty states, identical errors. Every decision in PR #2 favors "settled
and quiet" over "fresh and clever." We are paying down inconsistency
debt, not redesigning.

---

## Phase status

### Phase 1 — Tokens & headings · DONE (`31bd315`)

`app/globals.css` carries the design tokens — read it before adding new
colors / font sizes:

- Semantic colors via `@theme`: `--color-success / -bg`, `--color-warning
  / -bg`, `--color-danger / -bg`, `--color-info / -bg`, `--color-muted
  / -bg`. Use these (`bg-danger-bg`, `text-success`, etc.) — **never
  raw `red-600` / `green-700` in component code**.
- Typography composites (single-class shortcuts that bundle size + line-
  height + weight): `text-display`, `text-h1`, `text-h2`, `text-h3`,
  `text-body`, `text-body-lg`, `text-caption`, `text-overline`.
- Heading convention: `text-h1` / `text-h2` / `text-h3` are
  `text-gray-900`, sentence case. The legacy `text-sm font-bold
  uppercase tracking-wide text-indigo-700` h3 pattern is **dead** across
  14 sites — do not reintroduce it.

`Button` gained `size: "sm" | "md" | "lg"` (default `md` preserves
existing styling). `Label` is now `text-overline text-muted`.

### Phase 2 — New primitives · DONE except Combobox & Tooltip

Each primitive lives at `components/<name>.tsx`. All use Phase 1 tokens.

| Primitive | File | Notes |
| --- | --- | --- |
| `Toast` + `useToast` | `toast.tsx` | Bottom-right viewport, stack-3 FIFO, success/info auto-dismiss 4s, error sticky with X. `<ToastProvider>` mounted in `app/(app)/layout.tsx`. |
| `Modal` + `ConfirmModal` | `modal.tsx` | Centered, Esc/backdrop close, body scroll lock, **renders via `createPortal` to `document.body`** (required for inside `<tr>`). SSR-safe via `typeof document` guard. |
| `EmptyState` | `empty-state.tsx` | Card variant: icon + h2 + body + action slot. **Does not yet support a "bare" / "no Card" variant** — see Phase 3g below. |
| `Skeleton` | `skeleton.tsx` | Animated rectangle sized by caller. **Built but not yet applied anywhere** — Phase 3 didn't need it. Drop into table / chart loading states when you do. |
| `Drawer` | `drawer.tsx` | Side-anchored panel with header slot + built-in close button. Same Esc/backdrop/scroll-lock semantics as Modal. Already migrated the dashboard Coach detail drawer. |

**Deferred** (don't build unless needed):

- `Combobox` — the existing `components/staff-combobox.tsx` covers the
  one current use. Formalize only if a second use shows up.
- `Tooltip` — low priority, Recharts' built-in covers the one current
  need. Add when a real use case appears.

### Phase 3 — Pattern rollout · IN PROGRESS

Pattern target: every save flow goes through Toast; every destructive
action goes through `ConfirmModal`; no inline `{error && ...}` or
`{saved && "Saved ✓"}` left.

| Sub-batch | Status | Commit |
| --- | --- | --- |
| **3a** All 4 settings forms (Allowance rates / Performance options / KPI settings / Permissions) → Toast | DONE | `c6257cf` |
| **3b** Row-level edits (DirectoryRow + DetailsCard) → Toast | DONE | `39cf528` |
| **3c** 4 remaining `confirm()` → `ConfirmModal` (coach / note / appraisal / user delete) + Modal becomes a portal | DONE | `6e869b5` |
| **3d** Main calculators (Dashboard `saveMonth` + Allowance Calculator `save`) → Toast (kept `savedId` + "Saved to history → View record →" link as a useful nav shortcut) | DONE | `87b7d88` |
| **3e** KPI period field → native `<input type="month">` | DONE | `153836d` |
| **3f** Remaining inline-error → Toast across the create / edit forms | **PARTIAL** — AddUser done in `2d66683`. **Still pending:** `UserRow` patch / delete error display; `AddEmployee` (`staff-directory.tsx`); `NoteForm` (`notes-timeline.tsx`); `AppraisalForm` (`appraisals-section.tsx`) | partial: `2d66683` |
| **3g** `staff-directory.tsx` line ~79 nested empty state → `EmptyState` | PENDING. Blocked on: it sits inside a wrapping `<Card>`, so plain `<EmptyState/>` would render a Card-in-Card. Decide either to add a `variant="bare"` (no wrapping Card) prop to `EmptyState`, or just leave the inline `<p>` and document that this site is a deliberate exception. | — |

### Phase 4 — IA tidy · DONE (`cac6553`)

- Staff section nav label `Options` → `Settings` (all three sections
  now say the same word).
- `components/section-error.tsx` + a thin `app/(app)/<section>/error.tsx`
  per section so server errors render a friendly retry instead of a
  blank page.
- `CLAUDE.md` gained the **Settings IA — frozen rules** section. **Read
  it before asking "where should X go?"** — the rule:

  > Entities live under Staff. Calculator math lives under its
  > calculator. All three section tabs are "Settings", never "Options".

---

## Standing decisions (don't redo)

- **`window.confirm()` is dead across the app.** Six call sites were
  converted in 3c. If you add a destructive action, use `ConfirmModal`.
- **Modal / Drawer must portal.** `createPortal` to `document.body` —
  required for valid HTML when the modal lives inside `<tbody>` (see
  `user-manager.tsx`'s UserRow).
- **Inline `{error && <p>}` and `{saved && "Saved ✓"}` are dead** on
  every page Phase 3 has touched. Don't re-add them.
- **`savedId` on Dashboard / Allowance Calculator stays** — the
  "Saved to history. View record →" link is a useful navigational
  shortcut. Toast handles the transient confirm; the link handles the
  lasting destination. Mixed-pattern by design.
- **`splitCenters` lives in `lib/utils.ts`** (deduped from 4 inline
  copies in commit `1b622ef`). Import from there.
- **`saveAllowanceRates` + `saveCenters` helpers in `lib/db/queries.ts`**
  enforce the "rates save must not wipe centers" invariant. The two
  API routes call them; **don't** revert to inline `await
  saveAllowanceConfig(...)` writes that touch centers. Behavior locked
  by `lib/allowance/queries.test.ts`.
- **`useToast` must be called from inside `<ToastProvider>`** — the
  provider is mounted once in `app/(app)/layout.tsx`. Forms only
  rendered inside `(app)/...` can use it. `/login` is outside the
  provider — don't try to toast there.
- **Card padding sweep was intentionally deferred.** The blueprint
  called for `p-4 md:p-6` everywhere, but the change touches 35 sites
  and risks visual regressions. Touch padding only when you're already
  in a file for another reason.

---

## What's left in Phase 3

In ROI order — pick the next batch and ship it:

### 3f — finish the inline-error → Toast sweep · S

Four sites, all the same shape:

- `components/user-manager.tsx` → `UserRow`: `patch()` and the
  delete-error display next to the email. Remove `[error, setError]`,
  the inline `<div className="text-[11px] text-red-600">{error}</div>`
  on line ~279, and route both `patch` + `remove` failures through
  `toast.error`.
- `components/staff-directory.tsx` → `AddEmployee`: same as AddUser
  was. Remove `[error, setError]`, validation `setError("Name required")`
  → `toast.error`, server failure → `toast.error`, drop the inline
  `{error && <p>}` on line ~416.
- `components/notes-timeline.tsx` → `NoteForm`: same. Validation
  "A title is required." → `toast.error`. Drop inline error render.
- `components/appraisals-section.tsx` → `AppraisalForm`: same.
  "Add appraisal dimensions in Options first." → `toast.error`. Drop
  inline.

Pattern (already proven 6 times in PR #2):

```tsx
const toast = useToast();
// ...drop [error, setError]
async function submit() {
  if (!something) {
    toast.error("validation message.");
    return;
  }
  setBusy(true);
  try {
    const res = await fetch(...);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Save failed");
    }
    toast.success("X saved.");
    // ...reset / navigate
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Save failed");
  } finally {
    setBusy(false);
  }
}
// ...drop {error && <p>...} from render
```

### 3g — staff-directory nested empty state · S

Choose one:

- Add a `bare` / `noCard` variant to `EmptyState` and use it inside the
  existing Card.
- Leave the `<p>` and add a `// intentionally bare — nested inside a
  Card` comment.

### Optional polish (not strictly Phase 3, but in scope)

- Apply `Skeleton` to table loading states (KPI history, allowance
  history, staff directory). Requires wrapping the lists in `<Suspense>`
  or adding a client-side loading flag.
- Card padding sweep (`p-4 md:p-6` everywhere; kill `p-3`/`p-5`/`p-2`).
  Deferred from Phase 1 — only do this if a maintenance pass is
  warranted.

---

## Settings outside the repo

In this session we also touched `~/.claude/settings.json` (user-global,
not in the repo):

- `enableWorkflows: true` — turns on the Workflows feature.
- `ultracode: true` — schema says session-scoped, so writing it to
  settings.json may not actually persist. Verify after a fresh start.

These need a session restart to take effect; they are unrelated to PR
#2's code.

---

## Verification expectations

`npm run typecheck`, `npm run lint`, `npm test` (46/46), and a basic
dev smoke (`/`, `/kpi`, `/allowance`, `/staff`, `/account` all return
200, no errors in dev log) should pass on every commit. The
`lib/allowance/queries.test.ts` suite locks the centers no-clobber
guarantee and `updateUser` email contract — keep them green.
