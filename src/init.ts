import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG_FILENAME = 'lag-behind.config.jsonc';

const TEMPLATE = `{
  // How many versions to stay behind the latest published release.
  // Counted in releases, not semver increments — a major bump counts as one.
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
  // Also used to detect mismatches between what is declared in package.json
  // and what the tool expects — a mismatch means the audited version may
  // differ from what is actually installed.
  //
  // Can be a single value applied to all packages:
  //   "exact"  →  1.3.4    (recommended — audits are reliable)
  //   "caret"  →  ^1.3.4   (allows minor/patch drift — audit may be imprecise)
  //   "tilde"  →  ~1.3.4   (allows patch drift only — audit may be imprecise)
  //
  // Or a per-package map (use "default" as the fallback):
  //   { "default": "exact", "react": "tilde", "some-pkg": "caret" }
  "rangeSpecifier": "exact",

  // Packages to skip entirely during the audit.
  // Useful for tools where you intentionally stay on an older version
  // for reasons unrelated to the lag policy (e.g. peer dep constraints).
  "ignore": []
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
  console.log(`                   ignore (default) — silent. report — show upgrade command.`);
  console.log(``);
  console.log(`  rangeSpecifier   Version prefix in generated commands and mismatch detection.`);
  console.log(`                   exact (recommended) — 1.3.4`);
  console.log(`                   caret               — ^1.3.4  (audit may be imprecise)`);
  console.log(`                   tilde               — ~1.3.4  (audit may be imprecise)`);
  console.log(`                   Or a per-package map: { "default": "exact", "react": "tilde" }`);
  console.log(``);
  console.log(`  ignore           Array of package names to skip entirely.`);
  console.log(``);
  console.log(`CLI flags always override config file values.\n`);
}
