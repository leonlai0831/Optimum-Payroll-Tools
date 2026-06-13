#!/bin/bash
# SessionStart hook: make web-session skills available. Installs gstack (see the
# "gstack (recommended)" section in CLAUDE.md), the proprietary, not-vendored
# frontend-design skill from its official source (see "Vendored skills" in
# CLAUDE.md), and the pm-skills plugin marketplace (jobs-to-be-done). MIT
# skills are vendored directly under .claude/skills/.
#
# Design notes:
#  - Remote-only: does nothing on local machines (developers install gstack once).
#  - Idempotent: skips if ~/.claude/skills/gstack already exists.
#  - Non-fatal: always exits 0. gstack's ./setup exits non-zero when it cannot
#    download Playwright Chrome (the web sandbox's network allowlist blocks
#    cdn.playwright.dev). That only affects browser skills (/qa, /browse,
#    /connect-chrome); the ~50 Markdown skills install fine, so we must not let
#    it block the session.
#  - All human-readable output goes to stderr; stdout is left clean.
set -uo pipefail

# Only run in Claude Code on the web (remote) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# --- frontend-design (Anthropic official UI skill) -------------------------
# Proprietary ("© Anthropic PBC. All rights reserved."), so it is NOT vendored
# in the repo; install it from the official source each session instead. Light
# (~6s, one SKILL.md) and idempotent; install artifacts (.agents/,
# skills-lock.json, the .claude/skills/frontend-design symlink) are gitignored.
# Non-fatal: a failed fetch must not block the session.
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ ! -e "$PROJECT_DIR/.claude/skills/frontend-design" ]; then
  echo "frontend-design: installing via npx skills ..." >&2
  if ( cd "$PROJECT_DIR" && npx -y skills@latest add anthropics/claude-code --skill frontend-design ) >&2; then
    echo "frontend-design: installed." >&2
  else
    echo "frontend-design: install failed — skipping (session continues)." >&2
  fi
else
  echo "frontend-design: already present — skipping." >&2
fi

# --- pm-skills (deanpeters/Product-Manager-Skills marketplace) --------------
# Product-management skills for Claude Code. Installed at user scope each
# session (the remote container is ephemeral, so ~/.claude installs don't
# survive it). Both CLI commands are idempotent (exit 0 when already done);
# the registry grep just skips the CLI startup cost on warm containers.
# Non-fatal: a failed clone/install must not block the session.
if grep -qs '"jobs-to-be-done@pm-skills"' "$HOME/.claude/plugins/installed_plugins.json"; then
  echo "pm-skills: jobs-to-be-done already installed — skipping." >&2
else
  echo "pm-skills: adding marketplace + installing jobs-to-be-done ..." >&2
  if claude plugin marketplace add deanpeters/Product-Manager-Skills >&2 \
      && claude plugin install jobs-to-be-done@pm-skills >&2; then
    echo "pm-skills: installed." >&2
  else
    echo "pm-skills: install failed — skipping (session continues)." >&2
  fi
fi

GSTACK_DIR="$HOME/.claude/skills/gstack"

# Idempotent: container state is cached, so a prior install persists.
if [ -d "$GSTACK_DIR" ]; then
  echo "gstack: already installed at $GSTACK_DIR — skipping." >&2
  exit 0
fi

echo "gstack: installing into $GSTACK_DIR ..." >&2
mkdir -p "$HOME/.claude/skills"

if ! git clone --depth 1 https://github.com/garrytan/gstack.git "$GSTACK_DIR" >&2; then
  echo "gstack: clone failed — skipping install (session continues)." >&2
  rm -rf "$GSTACK_DIR"
  exit 0
fi

# ./setup builds the toolkit and tries to fetch Playwright Chrome, which the
# web sandbox blocks. Tolerate that — the Markdown skills are already in place.
if ( cd "$GSTACK_DIR" && ./setup --team ) >&2; then
  echo "gstack: setup complete." >&2
else
  echo "gstack: ./setup reported errors (most likely the blocked Playwright Chrome download). Markdown skills are installed; browser skills (/qa, /browse, /connect-chrome) need a Chrome install. Continuing." >&2
fi

exit 0
