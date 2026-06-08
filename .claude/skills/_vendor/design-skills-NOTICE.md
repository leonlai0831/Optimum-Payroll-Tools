# Design skills — provenance

## ui-ux-pro-max (vendored — MIT)

Vendored verbatim from [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
(MIT © 2024 Next Level Builder), pinned to commit `b7e3af80f6e331f6fb456667b82b12cade7c9d35`. License text:
`ui-ux-pro-max-LICENSE`.

Only the `ui-ux-pro-max` skill is vendored (SKILL.md + scripts/ + data/). The repo's
other skills — ui-styling, brand, design, design-system, banner-design, slides (the
"ckm-design" marketing set) — and its ~5.5M of bundled fonts are intentionally **not**
included. The Python (search.py / core.py / design_system.py) reads its CSV data via
`__file__`-relative paths and only writes design-system markdown when explicitly asked;
no network / subprocess / exec.

## frontend-design (NOT vendored — Anthropic proprietary)

Anthropic's official UI skill lives in `anthropics/claude-code`, which is
"© Anthropic PBC. All rights reserved." (Commercial ToS) — **not** open source. So it is
**not** committed here. Instead `.claude/hooks/session-start.sh` installs it from the
official source on each web session:

    npx skills add anthropics/claude-code --skill frontend-design

Its install artifacts (`.agents/`, `skills-lock.json`, `.claude/skills/frontend-design`)
are gitignored.
