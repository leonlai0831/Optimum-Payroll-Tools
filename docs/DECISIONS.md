# Decisions & divergences (archive)

> Extracted from `CLAUDE.md` (2026-06-14). This is the home for **stable, settled
> history** — divergences from the original rebuild plan, and frozen decisions
> that are no longer "current state" so much as "why it is the way it is". Keeping
> them here (instead of inline, date-stamped, throughout `CLAUDE.md`) stops dated
> decisions from accreting as noise in the main system doc.
>
> Where the live decision records live:
> - **This file** — divergences from the original plan + long-settled history.
> - **`ROADMAP.md` → "Decided — do not reopen"** — owner decisions that close a
>   direction (the active intent record).
> - **`CLAUDE.md` → "Settings IA — frozen rules"** — the IA/layout rules that must
>   not be re-litigated, kept inline because they bind day-to-day "where does X go?"
>   choices.
>
> When a dated operator decision in `CLAUDE.md` has fully stabilized (no longer
> debated, no pending follow-up), summarize the rule in place and move the dated
> rationale here.

## Divergences from the original plan

The app started life as a proposed rebuild plan for `KPI_Calculator_v11.1.html`;
where the implementation diverged from that plan, the code won. The notable
divergences:

- **Next.js 16** (plan said 15) → the gate is `proxy.ts`, not `middleware.ts`.
- **In-repo Tailwind components** (`components/ui.tsx`), not **shadcn/ui**.
- **PGlite** local fallback was added so the app runs with no cloud DB (not in the original plan).
- The **scoring-curve redesign** (continuous floor, capped growth) was **not** implemented; defaults
  stay byte-for-byte v11.1. What landed beyond v11.1: the configurable metric registry, a
  **lower-is-better** mode, and the two opt-in metrics (Net Progression + Downgrade Rate).
