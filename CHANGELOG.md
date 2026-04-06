# recul

## 0.5.0

### Minor Changes

- 46d7515: Add `gap` column showing number of stable versions between installed and latest. Refactor table to use dynamic column widths based on content. Add `--behindBehavior` CLI flag and `behind-behavior` action input to override config at runtime.
- 67df552: feat(cli): :sparkles: add support for behindBehavior as cli arg

## 0.4.1

### Patch Changes

- 9d8da5f: fix: 🐛 apply rangeSpecifier prefix when writing catalog fixes

## 0.4.0

### Minor Changes

- 5b0051f: feat: ✨ add exit codes and GitHub Action

## 0.3.0

### Minor Changes

- 3e24462: feat(resolve): ✨ add sameMajor config to restrict candidates to current major

## 0.2.0

### Minor Changes

- 68389e0: Add -dev to the preReleaseFilter defaults

## 0.1.0

### Minor Changes

- 49a65dc: Initial public release. Stay N versions behind the latest published npm releases to reduce supply chain attack surface. Features include pnpm catalog support with --fix, configurable lag, minimumReleaseAge filtering, pre-release filtering, lockfile-aware auditing, and a JSONC config file.
