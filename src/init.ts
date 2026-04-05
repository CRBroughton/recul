import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG_FILENAME = 'lag-behind.config.jsonc';

const TEMPLATE = `{
  // How many versions to stay behind the latest published release.
  // Counted in releases, not semver increments; a major bump counts as one.
  //
  //   1  →  days to weeks   (fast-moving projects, minimal buffer)
  //   2  →  weeks           (balanced default, recommended)
  //   3  →  weeks to months (cautious teams, slower release cadences)
  //   5+ →  months          (regulated environments, high-security contexts)
  "lag": 2,

  // Package manager used in this project.
  // Controls the phrasing of generated install commands and lockfile detection.
  //   "npm" | "pnpm"
  "packageManager": "npm",

  // Path to the package.json file to audit, relative to this config file.
  "packageFile": "package.json",

  // How to handle packages that are already older than the lag target
  // (e.g. you pinned something much older than the window).
  //
  //   "ignore"  →  treat as ok, no output (default)
  //   "report"  →  surface them with a safe upgrade-to-target command
  "behindBehavior": "ignore",

  // Version prefix used in generated install commands.
  // Also controls two things simultaneously:
  //
  //   1. Mismatch detection; flags packages declared with a different prefix
  //      than configured (e.g. "^1.2.3" declared but "exact" configured).
  //
  //   2. Lag comparison depth; how strictly the installed version must match
  //      the lag target before a pin-back is triggered:
  //        exact  →  all three parts compared  (1.2.3 must equal 1.2.3)
  //        tilde  →  major + minor compared    (1.2.x is ok if target is 1.2.0)
  //        caret  →  major only compared       (1.x.x is ok if target is 1.0.0)
  //
  //   Setting "react": "tilde" relaxes both checks for that package; patch
  //   differences will not trigger a pin-back and will not be flagged as mismatches.
  //
  // Can be a single value applied to all packages:
  //   "exact"  →  1.3.4    (recommended; audits are reliable)
  //   "caret"  →  ^1.3.4   (allows minor/patch drift; audit may be imprecise)
  //   "tilde"  →  ~1.3.4   (allows patch drift only; audit may be imprecise)
  //
  // Or a per-package map (use "default" as the fallback):
  //   { "default": "exact", "react": "tilde", "some-pkg": "caret" }
  "rangeSpecifier": "exact",

  // Packages to skip entirely during the audit.
  // Useful for tools where you intentionally stay on an older version
  // for reasons unrelated to the lag policy (e.g. peer dep constraints).
  "ignore": [],

  // Minimum number of days a version must have been published before it
  // is considered eligible as a lag target. Versions newer than this
  // threshold are excluded from the candidate list entirely.
  //
  // Combine with "lag" for defence-in-depth:
  //   lag: 2 + minimumReleaseAge: 3  →  at least 2 versions old AND published 3+ days ago
  //
  // Omit or set to 0 to disable (default).
  "minimumReleaseAge": 3
}
`;

export function runInit(cwd: string) {
  const dest = resolve(cwd, CONFIG_FILENAME);

  if (existsSync(dest)) {
    console.log(`\nlag-behind init\n`);
    console.log(`config file already exists: ${dest}`);
    console.log(`delete it first if you want to regenerate.\n`);
    process.exit(1);
  }

  writeFileSync(dest, TEMPLATE, 'utf8');

  console.log(`\nlag-behind init\n`);
  console.log(`created: ${dest}\n`);
  console.log(`configuration options:\n`);
  console.log(`  lag              How many versions behind latest to stay.`);
  console.log(`                   Default 2 (weeks of vetting window).`);
  console.log(``);
  console.log(`  packageManager   Controls generated install command phrasing.`);
  console.log(`                   npm | pnpm`);

  console.log(``);
  console.log(`  packageFile      Path to the package.json to audit.`);
  console.log(`                   Relative to this config file.`);
  console.log(``);
  console.log(`  behindBehavior   What to do with packages older than the lag target.`);
  console.log(`                   ignore (default); silent. report; show upgrade command.`);
  console.log(``);
  console.log(`  rangeSpecifier   Controls mismatch detection and lag comparison depth.`);
  console.log(`                   exact (recommended); pin-back if any part differs`);
  console.log(`                   tilde              ; pin-back only if major or minor differs`);
  console.log(`                   caret              ; pin-back only if major differs`);
  console.log(`                   Per-package map: { "default": "exact", "react": "tilde" }`);
  console.log(``);
  console.log(`  ignore           Array of package names to skip entirely.`);
  console.log(``);
  console.log(`  minimumReleaseAge  Minimum days a version must be published before it is eligible.`);
  console.log(`                     Omit or set to 0 to disable.`);
  console.log(``);
  console.log(`CLI flags always override config file values.\n`);
}
