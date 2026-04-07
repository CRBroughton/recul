export { auditDeps, buildCatalogUpdates } from './audit.js'
export { DEFAULTS, loadConfigFile, rangePrefix, resolveConfigDir, resolveRangeSpecifier, resolveSameMajor } from './config.js'
export { printMonorepoResults, printResults } from './output.js'
export type { MonorepoPackageResult } from './output.js'
export { computeTarget, fetchStableVersions, resolvePackage } from './resolve.js'
export { computeWidths, renderHeader, renderRows, statusLabel } from './table.js'
export type { TableWidths } from './table.js'
export type {
  AuditResult,
  AuditStatus,
  BehindBehavior,
  Config,
  ConfigFile,
  InstalledVersionMap,
  PackageJson,
  PackageManager,
  RangeSpecifier,
  RangeSpecifierConfig,
  ResolvedPackage,
  SameMajorConfig,
  WorkspacePackage,
} from './types.js'
