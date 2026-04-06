# recul

Stay N versions behind the latest published release of your npm dependencies to avoid supply chain attacks.

recul is not a replacement for typical auditing via `npm audit` or third party security tools; it is a complementary layer that reduces the attack surface without requiring active effort on every release cycle.

## How it works

Given a lag of `N`, the target version is `versions[latest_index - N]`. Only stable releases are counted; pre-release versions (configurable, defaults to `-alpha`, `-beta`, `-rc`, `-next`, `-canary`, `-dev`) are excluded. If a package has fewer releases than the lag value, recul pins to the oldest available stable version.

Packages already older than the lag target are left alone by default. The invariant is "never be too new", not "be exactly N behind".

## Requirements

- Node.js 18 or later

## Installation

```sh
npm i -D @crbroughton/recul
# or
pnpm add -D @crbroughton/recul
```

## Quick start

```sh
# Create a config file in the current directory
recul init

# Audit your dependencies
recul
```

## Configuration

Commit a `recul.config.jsonc` to standardise settings across the team.

```jsonc
{
  // How many versions to stay behind the latest published release.
  // Counted in releases, not semver increments.
  //
  //   1  →  days to weeks   (fast-moving projects, minimal buffer)
  //   2  →  weeks           (balanced default, recommended)
  //   3  →  weeks to months (cautious teams, slower release cadences)
  //   5+ →  months          (regulated environments, high-security contexts)
  "lag": 2,

  // Package manager: "npm" | "pnpm"
  "packageManager": "pnpm",

  // Path to the package.json to audit, relative to this config file.
  "packageFile": "package.json",

  // How to handle packages already older than the lag target.
  //   "ignore"  →  treat as ok, no output (default)
  //   "report"  →  surface them with a safe upgrade-to-target command
  "behindBehavior": "ignore",

  // Version prefix used in generated install commands.
  //   "exact"  →  1.3.4    (recommended; audits are reliable)
  //   "caret"  →  ^1.3.4   (allows minor/patch drift)
  //   "tilde"  →  ~1.3.4   (allows patch drift only)
  //
  // Per-package map also supported:
  //   { "default": "exact", "react": "tilde" }
  "rangeSpecifier": "exact",

  // Packages to skip entirely.
  "ignore": [],

  // Minimum days a version must have been published before it is eligible
  // as a lag target. Combines with "lag" for defence-in-depth.
  // Omit or set to 0 to disable.
  "minimumReleaseAge": 3,

  // Version strings containing any of these substrings are treated as
  // pre-releases and excluded from the candidate list.
  "preReleaseFilter": ["-alpha", "-beta", "-rc", "-next", "-canary", "-dev"],

  // Restrict the candidate list to the same major as the currently declared version.
  // Prevents resolving a target across major version lines (e.g. axios 0.x vs 1.x).
  // Can be a per-package map: { "default": true, "axios": false }
  "sameMajor": true
}
```

A config file is required; run `recul init` if you do not have one.

## CLI flags

| Flag | Description |
|------|-------------|
| `-f, --file` | Path to `package.json` (default: `package.json`) |
| `--fix` | Apply catalog fixes directly to `pnpm-workspace.yaml` |
| `--behindBehavior=<value>` | Override `behindBehavior` from config (`ignore` or `report`) |

## Output

```
recul  staying 2 versions behind latest

settings
  lag       2           ;  stay 2 versions behind latest
  pm        pnpm        ;  the chosen package manager
  behind    ignore      ;  ignore packages behind target
  range     exact       ;  pin exact versions
  minAge    3           ;  skip versions published within the last 3 days

package              declared          → target          latest            status
────────────────────────────────────────────────────────────────────────────────
express              ^4.19.2           4.17.3            4.19.2            ↓ will pin back
react                ^18.3.1           18.1.0            18.3.1            ↓ will pin back
typescript           5.4.5             5.4.5             5.4.5             ✓ ok

to pin back:
  pnpm add express@4.17.3 react@18.1.0
```

### Status values

| Status | Meaning |
|--------|---------|
| `✓ ok` | At or behind the lag target |
| `↓ will pin back` | Ahead of the lag target; install command shown |
| `↑ safe to upgrade` | Behind the target (only shown when `behindBehavior: report`) |
| `✗ unresolved` | Registry fetch failed or no stable versions found |

A `⚠ declared <specifier>` warning is appended when a package is declared with a different range prefix than `rangeSpecifier`; this means the audited version may differ from what is actually installed.

## pnpm catalog support

When using pnpm workspaces with a `catalogs` block in `pnpm-workspace.yaml`, recul reads catalog entries to resolve `catalog:` and `catalog:<name>` references in `package.json`.

Violations in catalog-managed packages are reported with the catalog entry to update rather than an install command. Pass `--fix` to apply the updates directly to `pnpm-workspace.yaml`.

## Lockfile support

When a lockfile is present, recul reads the installed version from it and uses that for comparison rather than the declared range. This gives accurate results for packages declared with `^` or `~`.

| Package manager | Lockfile |
|----------------|----------|
| npm | `package-lock.json` (v3) |
| pnpm | `pnpm-lock.yaml` (v6+) |

## GitHub Actions

Add recul to your CI pipeline to fail the workflow when dependencies are ahead of their lag target:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 20
- uses: CRBroughton/recul@v1
```

### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `working-directory` | `.` | Directory containing `recul.config.jsonc` and `package.json` |
| `fail-on-violations` | `true` | Set to `false` for informational runs that never fail |
| `behind-behavior` | `` | Override `behindBehavior` from config (`ignore` or `report`) |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | All packages are within their lag target |
| `1` | One or more packages need pinning, are unresolved, or (when `behindBehavior: report`) are behind target |
