# Onboarding a developer (Claude Code)

How to bring a second developer onto this repo to build a **bounded module**
(e.g. Marketing KPI) without giving them the run of the whole codebase.

## Mental model — three separate kinds of access

1. **Claude Code itself** is powered by the developer's **own Claude plan**
   (Pro / Max, or a Team seat). They sign in with their own Claude account.
2. **GitHub write access** is you adding them as a **repo collaborator**. This
   decides what they can push / open PRs against.
3. The app's **runtime secrets** (`ANTHROPIC_API_KEY`, DB URL, …) are unrelated
   to either of the above. In particular `ANTHROPIC_API_KEY` powers the *app's*
   AI features (name-merge, analysis) — it is **not** what runs their Claude Code.

> A single GitHub repo can't hard-limit a Write collaborator to one folder. The
> real boundary is the **merge gate** (branch protection + CODEOWNERS) — or
> splitting the module into its own repo. Claude Code runs with their GitHub
> permissions on a full clone, so enforcement happens at review/merge time.

## Owner checklist (you)

1. **Add them on GitHub** — repo → Settings → Collaborators → invite with
   **Write** (enough to push branches + open PRs; not Admin).
2. **Activate their ownership in [`.github/CODEOWNERS`](.github/CODEOWNERS)** —
   replace `USERNAME` with their handle and uncomment the `marketing` lines.
3. **Branch protection on `main`** (Settings → Branches → *Add classic branch
   protection rule*), pattern **`main`** (lower-case — it's case-sensitive):
   - Require a pull request before merging → Require approvals: **1**
   - Require review from **Code Owners** (turn on once CODEOWNERS is set)
   - Require status checks: **`build`, `test`, `e2e`**
   - Leave *"Do not allow bypassing / Include administrators"* **off** so you, as
     admin, can still merge your own PRs when working solo.

## Developer checklist (them)

1. Have a **Claude Pro / Max** plan (or a Team seat).
2. Go to **`claude.ai/code`** → sign in → authorize the **Claude GitHub App** →
   pick this repo (the app surfaces repos *they* have access to, so step 1 of the
   owner checklist must be done first).
3. Create a Claude Code **environment** with a network policy that allows
   `npm install` + GitHub access. Environments + secrets are **per-person** — they
   set up their own; nothing is inherited from yours.
4. Read **`CLAUDE.md`** and **`AGENTS.md`** before writing code.

> Prefer the local CLI instead? `curl -fsSL https://claude.ai/install.sh | bash`,
> then `claude` to log in (same plan/account model).

## Running it locally (almost no secrets needed)

This app runs with **no cloud database**: with `POSTGRES_URL` unset it falls back
to in-process **PGlite** (`./.pglite`). In dev, `APP_PASSWORD` also falls back to
`swim123`. So a `.env.local` with just:

```
SESSION_SECRET=<32+ random characters>
```

is enough to run `npm run dev`. `ANTHROPIC_API_KEY` is optional (only to exercise
the app's AI features). **Don't share production database/credentials for dev.**

## Gates (must be green before merge)

```
npm run typecheck
npm run lint
npm run build
npm test
```

CI also runs Playwright **`e2e`**. Same gates the owner uses.

## Working scope & conventions

- **Stay in the module sandbox:** `app/(app)/marketing/`, `lib/marketing/`,
  `components/marketing/`. Anything outside needs the owner's review (CODEOWNERS).
- **Shared seams to coordinate on** (owner-reviewed): `lib/db/schema.ts` +
  `lib/db/migrations/`, navigation (`components/section-nav.tsx` / home launcher),
  permissions/roles, `components/ui.tsx`, `components/responsive-table.tsx`,
  `CLAUDE.md`.
- **One task → one branch → one (draft) PR.** Each Claude Code web session is its
  own isolated container + branch, so two people never clobber each other.
- **Mobile-first is a hard rule** — cards-on-mobile / table-on-desktop via
  `components/responsive-table.tsx`. See `CLAUDE.md` for the full list (Settings
  IA freeze, Next 16 `proxy.ts`, KPI defaults locked to v11.1, …).
