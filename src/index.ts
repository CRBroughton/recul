export { auditDeps } from './audit.js';
export { computeTarget, fetchStableVersions, resolvePackage } from './resolve.js';
export { loadConfigFile, resolveConfigDir, resolveRangeSpecifier, rangePrefix, DEFAULTS } from './config.js';
export { printResults } from './output.js';
export type {
  Config,
  ConfigFile,
  PackageManager,
  BehindBehavior,
  RangeSpecifier,
  RangeSpecifierConfig,
  ResolvedPackage,
  InstalledVersionMap,
  AuditStatus,
  AuditResult,
  PackageJson,
} from './types.js';
