#!/bin/bash
# SessionStart hook: auto-install gstack so its skills are available in every
# Claude Code on the web session. See the "gstack (recommended)" section in
# CLAUDE.md for the manual install equivalent.
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
