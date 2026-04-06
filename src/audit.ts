import type { AuditResult, AuditStatus, BehindBehavior, InstalledVersionMap, PackageJson, RangeSpecifier, RangeSpecifierConfig, SameMajorConfig } from './types.js'
import { rangePrefix, resolveRangeSpecifier, resolveSameMajor } from './config.js'
import { resolvePackage } from './resolve.js'
import { bareVersion, detectSpecifier, semverCompareForSpecifier } from './semver.js'

interface AuditOneOptions {
  name: string
  rawVersion: string
  lag: number
  minimumReleaseAge?: number
  preReleaseFilter: string[]
  sameMajor: boolean
  rangeSpecifier: RangeSpecifier
  installedVersion: string | null
  fromCatalog: boolean
}

async function auditOne({ name, rawVersion, lag, minimumReleaseAge, preReleaseFilter, sameMajor, rangeSpecifier, installedVersion, fromCatalog }: AuditOneOptions): Promise<AuditResult> {
  const declared = rawVersion
  const isCatalogRef = rawVersion.startsWith('catalog:')

  // catalog: entries have no usable version in package.json — the lockfile is required
  if (isCatalogRef && installedVersion === null) {
    return { name, declared, current: '', installed: null, target: null, latest: null, status: 'unresolved', rangeSpecifier, declaredSpecifier: 'other', specifierMismatch: false, fromCatalog, error: 'catalog reference; pnpm lockfile required' }
  }

  const current = isCatalogRef ? installedVersion! : bareVersion(rawVersion)
  const installed = installedVersion
  const declaredSpecifier = isCatalogRef ? 'other' : detectSpecifier(rawVersion)
  const specifierMismatch = declaredSpecifier !== 'other' && declaredSpecifier !== rangeSpecifier

  let resolved
  try {
    resolved = await resolvePackage({ name, lag, preReleaseFilter, sameMajor, currentVersion: current, ...(minimumReleaseAge !== undefined ? { minimumReleaseAge } : {}) })
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { name, declared, current, installed, target: null, latest: null, status: 'unresolved', rangeSpecifier, declaredSpecifier, specifierMismatch, fromCatalog, error: message }
  }

  const { target, latest } = resolved

  if (target === null) {
    return { name, declared, current, installed, target: null, latest, status: 'unresolved', rangeSpecifier, declaredSpecifier, specifierMismatch, fromCatalog, error: 'no stable versions found' }
  }

  const compareVersion = installed ?? current
  const cmp = semverCompareForSpecifier({ versionA: compareVersion, versionB: target, specifier: rangeSpecifier })
  let status: AuditStatus
  if (cmp > 0)
    status = 'pin'
  else if (cmp === 0)
    status = 'ok'
  else status = 'behind'

  return { name, declared, current, installed, target, latest, status, rangeSpecifier, declaredSpecifier, specifierMismatch, fromCatalog }
}

export interface AuditDepsOptions {
  pkgJson: PackageJson
  lag: number
  minimumReleaseAge?: number
  preReleaseFilter?: string[]
  sameMajor?: SameMajorConfig
  rangeSpecifier: RangeSpecifierConfig
  ignore?: string[]
  installed?: InstalledVersionMap
  catalogPackages?: ReadonlySet<string>
}

/**
 * Audit all dependencies in a package.json object.
 * - `ignore`: skip these package names entirely.
 * - `installed`: lockfile-resolved version map; used for comparison when present.
 * - `rangeSpecifier`: global string or per-package record.
 */
export async function auditDeps({ pkgJson, lag, minimumReleaseAge, preReleaseFilter = [], sameMajor = true, rangeSpecifier, ignore = [], installed, catalogPackages }: AuditDepsOptions): Promise<AuditResult[]> {
  const deps: Record<string, string> = {
    ...(pkgJson.dependencies ?? {}),
    ...(pkgJson.devDependencies ?? {}),
  }

  let names = Object.keys(deps)
  if (ignore.length > 0) {
    const ignoreSet = new Set(ignore)
    names = names.filter(n => !ignoreSet.has(n))
  }

  return Promise.all(
    names.map(n =>
      auditOne({
        name: n,
        rawVersion: deps[n] ?? '',
        lag,
        ...(minimumReleaseAge !== undefined ? { minimumReleaseAge } : {}),
        preReleaseFilter,
        sameMajor: resolveSameMajor({ config: sameMajor, name: n }),
        rangeSpecifier: resolveRangeSpecifier({ config: rangeSpecifier, name: n }),
        installedVersion: installed?.[n] ?? null,
        fromCatalog: catalogPackages?.has(n) ?? false,
      }),
    ),
  )
}

/**
 * Build the catalog update map for --fix.
 * Returns a record of package name → versioned string (with range prefix applied).
 */
export function buildCatalogUpdates(results: AuditResult[], behindBehavior: BehindBehavior): Record<string, string> {
  const updates: Record<string, string> = {}
  for (const r of results) {
    if (!r.fromCatalog)
      continue
    const prefix = rangePrefix(r.rangeSpecifier)
    if (r.status === 'pin' && r.target !== null)
      updates[r.name] = `${prefix}${r.target}`
    else if (r.status === 'behind' && behindBehavior === 'report' && r.target !== null)
      updates[r.name] = `${prefix}${r.target}`
    else if (r.specifierMismatch && r.status !== 'pin')
      updates[r.name] = `${prefix}${r.current}`
  }
  return updates
}
