# Vendored skills — obra/superpowers (curated subset)

The following skills under `.claude/skills/` are vendored verbatim from
[obra/superpowers](https://github.com/obra/superpowers) (MIT © 2025 Jesse Vincent),
pinned to commit `6fd4507659784c351abbd2bc264c7162cfd386dc`. License text: `superpowers-LICENSE`.

**Why vendored (not bootstrapped):** Claude Code on the web runs in an ephemeral
container, so committing the skills into the repo makes them available every
session with zero network — the same pattern this repo already uses for
`karpathy-guidelines`. (gstack is bootstrapped separately by
`.claude/hooks/session-start.sh`.)

**Curated subset** — the correctness/review-discipline skills that fit a payroll
app where a logic or rounding bug means wrong pay:

- test-driven-development
- systematic-debugging
- verification-before-completion
- requesting-code-review
- receiving-code-review
- brainstorming
- writing-plans

**Deliberately not vendored:** dispatching-parallel-agents, subagent-driven-development,
using-git-worktrees, executing-plans, finishing-a-development-branch, using-superpowers,
writing-skills — agent-orchestration/meta skills already covered natively. Some kept
skills mention these by name; those references are advisory only.

**Excluded files:** each skill's internal dev/eval artifacts (`CREATION-LOG.md`,
`test-academic.md`, `test-pressure-*.md`) were dropped; no SKILL.md references them.

To update: re-copy from a newer superpowers checkout and bump the commit above.
