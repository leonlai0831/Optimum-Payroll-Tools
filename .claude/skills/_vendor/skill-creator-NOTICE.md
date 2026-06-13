# Vendored skill — anthropics/skills · skill-creator

`.claude/skills/skill-creator/` is vendored verbatim from
[anthropics/skills](https://github.com/anthropics/skills) (Apache License 2.0,
© Anthropic), pinned to commit `57546260929473d4e0d1c1bb75297be2fdfa1949`.
Its license travels with it at `.claude/skills/skill-creator/LICENSE.txt`.

**What it is:** the official skill-authoring skill — create new skills, edit /
optimize existing ones, and run evals to benchmark a skill's triggering accuracy
and performance (ships `agents/`, `eval-viewer/`, `references/`, `scripts/`).

**Why vendored (not bootstrapped):** Apache-2.0 is permissive, so — like the
obra/superpowers and ui-ux-pro-max subsets — committing it makes it available in
every Claude Code on the web session with zero network. (The proprietary
`frontend-design` skill, with no license grant, stays bootstrapped by
`.claude/hooks/session-start.sh` and gitignored.)

To update: re-copy from a newer anthropics/skills checkout and bump the commit above.
