export type PackageManager = 'npm' | 'pnpm'

export type BehindBehavior = 'ignore' | 'report'
export type RangeSpecifier = 'exact' | 'caret' | 'tilde'

/**
 * Either a single specifier applied to all packages, or a per-package map.
 * The "default" key in the map acts as the fallback for unlisted packages.
 *
 * @example
 * "exact"
 * { "default": "exact", "react": "tilde", "lodash": "caret" }
 */
export type RangeSpecifierConfig = RangeSpecifier | Record<string, RangeSpecifier>

/**
 * Either a boolean applied to all packages, or a per-package map.
 * The "default" key in the map acts as the fallback for unlisted packages.
 *
 * @example
 * true
 * { "default": true, "axios": false }
 */
export type SameMajorConfig = boolean | Record<string, boolean>

export interface Config {
  lag: number
  file: string
  pm: PackageManager
  ignore: string[]
  behindBehavior: BehindBehavior
  rangeSpecifier: RangeSpecifierConfig
  minimumReleaseAge?: number
  preReleaseFilter: string[]
  sameMajor: SameMajorConfig
}

/** Shape of recul.config.json(c) */
export interface ConfigFile {
  lag?: number
  packageManager?: PackageManager
  packageFile?: string
  behindBehavior?: BehindBehavior
  rangeSpecifier?: RangeSpecifierConfig
  ignore?: string[]
  minimumReleaseAge?: number
  preReleaseFilter?: string[]
  sameMajor?: SameMajorConfig
}

export interface ResolvedPackage {
  name: string
  stableVersions: string[]
  latest: string | null
  target: string | null
}

/** name → installed version, resolved from a lockfile. */
export type InstalledVersionMap = Record<string, string>

export type AuditStatus = 'ok' | 'pin' | 'behind' | 'unresolved'

/** The range prefix declared in package.json. */
export type DeclaredSpecifier = 'exact' | 'caret' | 'tilde' | 'other'

export interface AuditResult {
  name: string
  /** Raw version string as declared in package.json, e.g. "^1.3.4". */
  declared: string
  /** Bare version with range prefix stripped, e.g. "1.3.4". */
  current: string
  /** Actually installed version from lockfile, or null if no lockfile. */
  installed: string | null
  target: string | null
  latest: string | null
  status: AuditStatus
  /** The resolved rangeSpecifier for this specific package. */
  rangeSpecifier: RangeSpecifier
  declaredSpecifier: DeclaredSpecifier
  /** True when declaredSpecifier doesn't match the configured rangeSpecifier. */
  specifierMismatch: boolean
  /** True when the version was declared as a pnpm catalog reference. */
  fromCatalog: boolean
  /** Number of stable versions between the installed/current version and latest. Null when unresolved. */
  versionsFromLatest: number | null
  error?: string
}

/** Shape of what we read from package.json. */
export interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export interface WorkspacePackage {
  /** Package name from package.json, or directory path if name is absent. */
  name: string
  /** Absolute path to the package directory. */
  dir: string
}
