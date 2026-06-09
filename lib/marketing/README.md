# `lib/marketing` — Marketing KPI domain logic

Home for the **Marketing KPI** module's non-UI logic (pure functions, types, DB
queries). Keep UI in `components/marketing/` and routes in `app/(app)/marketing/`.

**Launcher cards:** `tools.ts` here is the list of cards shown under the
"Optimum Marketing" group on the home page — add one entry per feature (each
`href` points at a route you build under `app/(app)/marketing/`). The shared
launcher (`app/(app)/page.tsx`) just renders this list, so you never have to
edit it to add a card.

Mirror the existing `lib/kpi/` shape when you build this out, e.g.:

- `types.ts` — module types
- `calc.ts` — pure, unit-tested scoring/aggregation (lock it with Vitest, like
  `lib/kpi/calc.test.ts`)
- queries via `lib/db` — **adding tables/columns touches the shared
  `lib/db/schema.ts` + a migration**, which is outside this sandbox and needs the
  repo owner's review (see CODEOWNERS).

See `ONBOARDING.md` at the repo root for setup + conventions.
