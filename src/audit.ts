import { resolvePackage } from './resolve.js';
import { bareVersion, semverCompareForSpecifier, detectSpecifier } from './semver.js';
import { resolveRangeSpecifier } from './config.js';
import type { AuditResult, AuditStatus, InstalledVersionMap, PackageJson, RangeSpecifier, RangeSpecifierConfig } from './types.js';

interface AuditOneOptions {
  name: string;
  rawVersion: string;
  lag: number;
  minimumReleaseAge?: number;
  preReleaseFilter: string[];
  rangeSpecifier: RangeSpecifier;
  installedVersion: string | null;
  fromCatalog: boolean;
}

async function auditOne({ name, rawVersion, lag, minimumReleaseAge, preReleaseFilter, rangeSpecifier, installedVersion, fromCatalog }: AuditOneOptions): Promise<AuditResult> {
  const declared = rawVersion;
  const isCatalogRef = rawVersion.startsWith('catalog:');

  // catalog: entries have no usable version in package.json — the lockfile is required
  if (isCatalogRef && installedVersion === null) {
    return { name, declared, current: '', installed: null, target: null, latest: null, status: 'unresolved', rangeSpecifier, declaredSpecifier: 'other', specifierMismatch: false, fromCatalog, error: 'catalog reference; pnpm lockfile required' };
  }

  const current = isCatalogRef ? installedVersion! : bareVersion(rawVersion);
  const installed = installedVersion;
  const declaredSpecifier = isCatalogRef ? 'other' : detectSpecifier(rawVersion);
  const specifierMismatch = declaredSpecifier !== 'other' && declaredSpecifier !== rangeSpecifier;

  let resolved;
  try {
    resolved = await resolvePackage({ name, lag, preReleaseFilter, ...(minimumReleaseAge !== undefined ? { minimumReleaseAge } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name, declared, current, installed, target: null, latest: null, status: 'unresolved', rangeSpecifier, declaredSpecifier, specifierMismatch, fromCatalog, error: message };
  }

  const { target, latest } = resolved;

  if (target === null) {
    return { name, declared, current, installed, target: null, latest, status: 'unresolved', rangeSpecifier, declaredSpecifier, specifierMismatch, fromCatalog, error: 'no stable versions found' };
  }

  const compareVersion = installed ?? current;
  const cmp = semverCompareForSpecifier({ versionA: compareVersion, versionB: target, specifier: rangeSpecifier });
  let status: AuditStatus;
  if (cmp > 0)        status = 'pin';
  else if (cmp === 0) status = 'ok';
  else                status = 'behind';

  return { name, declared, current, installed, target, latest, status, rangeSpecifier, declaredSpecifier, specifierMismatch, fromCatalog };
}

export interface AuditDepsOptions {
  pkgJson: PackageJson;
  lag: number;
  minimumReleaseAge?: number;
  preReleaseFilter?: string[];
  rangeSpecifier: RangeSpecifierConfig;
  only?: string[];
  ignore?: string[];
  installed?: InstalledVersionMap;
  catalogPackages?: ReadonlySet<string>;
}

/**
 * Audit all dependencies in a package.json object.
 * - `only`: when non-empty, audit only these package names.
 * - `ignore`: skip these package names entirely.
 * - `installed`: lockfile-resolved version map; used for comparison when present.
 * - `rangeSpecifier`: global string or per-package record.
 */
export async function auditDeps({ pkgJson, lag, minimumReleaseAge, preReleaseFilter = [], rangeSpecifier, only = [], ignore = [], installed, catalogPackages }: AuditDepsOptions): Promise<AuditResult[]> {
  const deps: Record<string, string> = {
    ...(pkgJson.dependencies ?? {}),
    ...(pkgJson.devDependencies ?? {}),
  };

  let names = only.length > 0 ? only.filter((n) => n in deps) : Object.keys(deps);
  if (ignore.length > 0) {
    const ignoreSet = new Set(ignore);
    names = names.filter((n) => !ignoreSet.has(n));
  }

  return Promise.all(
    names.map((n) =>
      auditOne({
        name: n,
        rawVersion: deps[n] ?? '',
        lag,
        ...(minimumReleaseAge !== undefined ? { minimumReleaseAge } : {}),
        preReleaseFilter,
        rangeSpecifier: resolveRangeSpecifier({ config: rangeSpecifier, name: n }),
        installedVersion: installed?.[n] ?? null,
        fromCatalog: catalogPackages?.has(n) ?? false,
      }),
    ),
  );
}
