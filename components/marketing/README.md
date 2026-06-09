# `components/marketing` — Marketing KPI UI

Home for the **Marketing KPI** module's React components.

Conventions (see `CLAUDE.md`):

- **Mobile-first.** Any data table uses the shared `MobileCards` / `DesktopTable`
  wrappers from `components/responsive-table.tsx` (cards on phones, table at
  `lg`+) — never a horizontal-scrolling table on a phone.
- Reuse the in-repo kit in `components/ui.tsx` (`Card`, `Button`, `Input`,
  `Select`, …) rather than introducing new primitives.
- Touch targets ≥ ~44px; tabular figures for numbers.

Routes that render these live in `app/(app)/marketing/`.
