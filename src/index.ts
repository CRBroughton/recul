export { auditDeps } from './audit.js'
export { DEFAULTS, loadConfigFile, rangePrefix, resolveConfigDir, resolveRangeSpecifier } from './config.js'
export { printResults } from './output.js'
export { computeTarget, fetchStableVersions, resolvePackage } from './resolve.js'
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
} from './types.js'
