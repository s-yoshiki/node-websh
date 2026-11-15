# Repository Guide

node-websh is a Node.js / TypeScript project.

## Toolchain

- Use Node.js 26 and the pnpm version pinned by the root `package.json`.
- Keep shared lint and format settings in `configs/oxlint/` and `configs/oxfmt/`.
- Keep shared dependency versions in `pnpm-workspace.yaml` catalogs.
- Record technical decisions in `docs/adr/`.

## Validation

Run `pnpm verify` before hand-off. Do not run deployment or infrastructure mutation commands during validation.
