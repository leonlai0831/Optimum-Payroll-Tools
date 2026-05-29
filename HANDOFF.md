# UX Rebuild — Phase 3 Handoff

PR #2 (`claude/laughing-wright-Zj9Ri`) carried a UX blueprint rollout.
Phases 1, 2, and 4 are landed. **Phase 3 (the pattern rollout) is now
DONE** — the remaining 3f inline-error → Toast migrations and the 3g
nested empty state were finished on `claude/phase-3-continuation-DAy4I`
(this branch fast-forwarded over the PR #2 tip, so it contains all prior
phases). This file is the contract between the session that started the
work and the session that finished it — read it before reopening Phase 3.

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
| `EmptyState` | `empty-state.tsx` | Card variant: icon + h2 + body + action slot. Pass `bare` to drop the wrapping Card (for empty states already inside a Card — e.g. an empty table body). |
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
| **3f** Remaining inline-error → Toast across the create / edit forms | **DONE.** AddUser in `2d66683`; the rest (`UserRow` patch + delete; `AddEmployee` in `staff-directory.tsx`; `NoteForm` in `notes-timeline.tsx`; `AppraisalForm` in `appraisals-section.tsx`) migrated here. All four lost `[error, setError]` + inline `<p>` and route success/failure through `useToast`. (`AppraisalForm`'s validation copy moved "Options" → "Settings" per the Phase 4 IA rule.) | DONE |
| **3g** `staff-directory.tsx` line ~79 nested empty state → `EmptyState` | **DONE.** Resolved by adding a `bare` prop to `EmptyState` (same content, no wrapping `Card`) and using it inside the existing directory Card. | DONE |

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

**Nothing — Phase 3 is complete.** 3f and 3g (below) were the final
batches; both shipped on `claude/phase-3-continuation-DAy4I`. The
pattern target now holds across the app: every save flow goes through
Toast, every destructive action through `ConfirmModal`, and no inline
`{error && ...}` / `{saved && "Saved ✓"}` remains on any form Phase 3
touched. Kept the Toast pattern below for reference / future forms.

### 3f — inline-error → Toast sweep · DONE

The four remaining create/edit forms were migrated (AddUser was already
done in `2d66683`):

- `components/user-manager.tsx` → `UserRow`: dropped `[error, setError]`
  and the inline `<div className="text-[11px] text-red-600">{error}</div>`;
  `patch` + `remove` failures now `toast.error`.
- `components/staff-directory.tsx` → `AddEmployee`: dropped state +
  inline `{error && <p>}`; "Name required." + server failure → `toast`;
  success → `toast.success("Employee created.")`.
- `components/notes-timeline.tsx` → `NoteForm`: "A title is required." →
  `toast.error`; success → `toast.success("Note saved.")`.
- `components/appraisals-section.tsx` → `AppraisalForm`: dimension-guard
  message → `toast.error` (and reworded "Options" → "Settings" per the
  Phase 4 IA rule); success → `toast.success("Appraisal saved.")`.

Pattern (proven across the app — use it for any new form):

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

### 3g — staff-directory nested empty state · DONE

Resolved via option 1: `EmptyState` gained a `bare` prop (same content,
no wrapping `Card`), and the directory's empty-table state now renders
`<EmptyState bare icon={Users} title="No employees yet" … />` inside the
existing Card — no more Card-in-Card.

### Optional polish (not strictly Phase 3, but in scope — still open)

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
