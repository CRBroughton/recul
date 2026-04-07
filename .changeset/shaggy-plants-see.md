---
"@crbroughton/recul": minor
---

Add pnpm monorepo support. recul detects `pnpm-workspace.yaml` and audits each workspace package separately, grouping output by package with shared column widths. Installed versions are resolved per-importer from the lockfile. `--fix` applies catalog updates across all packages in one pass.
