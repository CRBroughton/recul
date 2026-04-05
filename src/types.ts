export type PackageManager = 'npm' | 'pnpm';

export type BehindBehavior = 'ignore' | 'report';
export type RangeSpecifier = 'exact' | 'caret' | 'tilde';

/**
 * Either a single specifier applied to all packages, or a per-package map.
 * The "default" key in the map acts as the fallback for unlisted packages.
 *
 * @example
 * "exact"
 * { "default": "exact", "react": "tilde", "lodash": "caret" }
 */
export type RangeSpecifierConfig = RangeSpecifier | Record<string, RangeSpecifier>;

export interface Config {
  lag: number;
  file: string;
  pm: PackageManager;
  packages: string[];
  ignore: string[];
  behindBehavior: BehindBehavior;
  rangeSpecifier: RangeSpecifierConfig;
}

/** Shape of lag-behind.config.json(c) */
export interface ConfigFile {
  lag?: number;
  packageManager?: PackageManager;
  packageFile?: string;
  behindBehavior?: BehindBehavior;
  rangeSpecifier?: RangeSpecifierConfig;
  ignore?: string[];
}

export interface ResolvedPackage {
  name: string;
  stableVersions: string[];
  latest: string | null;
  target: string | null;
}

/** name → installed version, resolved from a lockfile. */
export type InstalledVersionMap = Record<string, string>;

export type AuditStatus = 'ok' | 'pin' | 'behind' | 'unresolved';

/** The range prefix declared in package.json. */
export type DeclaredSpecifier = 'exact' | 'caret' | 'tilde' | 'other';

export interface AuditResult {
  name: string;
  /** Raw version string as declared in package.json, e.g. "^1.3.4". */
  declared: string;
  /** Bare version with range prefix stripped, e.g. "1.3.4". */
  current: string;
  /** Actually installed version from lockfile, or null if no lockfile. */
  installed: string | null;
  target: string | null;
  latest: string | null;
  status: AuditStatus;
  /** The resolved rangeSpecifier for this specific package. */
  rangeSpecifier: RangeSpecifier;
  declaredSpecifier: DeclaredSpecifier;
  /** True when declaredSpecifier doesn't match the configured rangeSpecifier. */
  specifierMismatch: boolean;
  /** True when the version was declared as a pnpm catalog reference. */
  fromCatalog: boolean;
  error?: string;
}

/** Shape of what we read from package.json. */
export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
