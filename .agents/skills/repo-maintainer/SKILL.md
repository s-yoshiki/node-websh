---
name: repo-maintainer
description: Maintain node-websh and keep its configuration, documentation, and CI checks in sync.
---

# Repository Maintainer

## Workflow

1. Read the repository guide and the closest source or configuration before editing.
2. Preserve unrelated changes and do not edit generated files.
3. Use Node.js 26 and the pinned pnpm version from the root package.
4. Keep shared lint and format rules in `configs/oxlint/` and `configs/oxfmt/`; use pnpm catalog entries for shared dependency versions.
5. Record technical decisions in `docs/adr/` and update the index when needed.

## Validation

Run `pnpm verify` for repository changes. Report commands and results exactly; never run deploy or other external mutations as part of verification.
