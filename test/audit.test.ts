import type { AuditResult, PackageJson } from '../src/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auditDeps, buildCatalogUpdates } from '../src/audit.js'

const CATALOG_REF_RE = /catalog reference/

function makeRegistry(versions: Record<string, Record<string, unknown>>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const name = decodeURIComponent(url.split('/').at(-1) ?? '')
    const pkgVersions = versions[name]
    if (!pkgVersions) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    }
    return new Response(JSON.stringify({ versions: pkgVersions }), { status: 200 })
  })
}

describe('auditDeps', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('marks a package as pin when current is ahead of lag target', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      express: { '4.17.0': {}, '4.18.0': {}, '4.19.0': {} },
    }))

    const pkgJson: PackageJson = { dependencies: { express: '4.19.0' } }
    const [result] = await auditDeps({ pkgJson, lag: 2, rangeSpecifier: 'exact' })

    expect(result!.name).toBe('express')
    expect(result!.status).toBe('pin')
    expect(result!.target).toBe('4.17.0')
    expect(result!.installed).toBeNull()
    expect(result!.rangeSpecifier).toBe('exact')
  })

  it('resolves per-package rangeSpecifier from a config record', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      react: { '18.0.0': {}, '18.1.0': {}, '18.2.0': {} },
      lodash: { '4.17.0': {}, '4.17.1': {}, '4.17.2': {} },
    }))

    const pkgJson: PackageJson = { dependencies: { react: '18.2.0', lodash: '4.17.2' } }
    const results = await auditDeps({
      pkgJson,
      lag: 2,
      rangeSpecifier: { default: 'exact', react: 'tilde' },
    })

    const reactResult = results.find(r => r.name === 'react')!
    const lodashResult = results.find(r => r.name === 'lodash')!
    expect(reactResult.rangeSpecifier).toBe('tilde')
    expect(lodashResult.rangeSpecifier).toBe('exact')
  })

  it('marks a package as ok when current equals lag target', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      express: { '4.17.0': {}, '4.18.0': {}, '4.19.0': {} },
    }))

    const pkgJson: PackageJson = { dependencies: { express: '4.17.0' } }
    const [result] = await auditDeps({ pkgJson, lag: 2, rangeSpecifier: 'exact' })

    expect(result!.status).toBe('ok')
  })

  it('marks a package as behind when current is older than lag target', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      express: { '4.17.0': {}, '4.18.0': {}, '4.19.0': {} },
    }))

    const pkgJson: PackageJson = { dependencies: { express: '4.16.0' } }
    const [result] = await auditDeps({ pkgJson, lag: 2, rangeSpecifier: 'exact' })

    expect(result!.status).toBe('behind')
  })

  it('marks a package as unresolved on registry failure', async () => {
    vi.stubGlobal('fetch', makeRegistry({}))

    const pkgJson: PackageJson = { dependencies: { 'no-such-pkg': '1.0.0' } }
    const [result] = await auditDeps({ pkgJson, lag: 2, rangeSpecifier: 'exact' })

    expect(result!.status).toBe('unresolved')
    expect(result!.error).toBeTruthy()
  })

  it('audits both dependencies and devDependencies', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      react: { '18.0.0': {}, '18.1.0': {}, '18.2.0': {} },
      typescript: { '5.0.0': {}, '5.1.0': {}, '5.2.0': {} },
    }))

    const pkgJson: PackageJson = {
      dependencies: { react: '18.2.0' },
      devDependencies: { typescript: '5.2.0' },
    }
    const results = await auditDeps({ pkgJson, lag: 2, rangeSpecifier: 'exact' })

    expect(results).toHaveLength(2)
    expect(results.every(r => r.status === 'pin')).toBe(true)
  })

  it('skips packages in the ignore list', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      react: { '18.0.0': {}, '18.1.0': {}, '18.2.0': {} },
      lodash: { '4.17.0': {}, '4.17.1': {}, '4.17.2': {} },
    }))

    const pkgJson: PackageJson = {
      dependencies: { react: '18.2.0', lodash: '4.17.2' },
    }
    const results = await auditDeps({ pkgJson, lag: 2, rangeSpecifier: 'exact', ignore: ['lodash'] })

    expect(results).toHaveLength(1)
    expect(results[0]!.name).toBe('react')
  })

  it('detects specifier mismatch when caret declared but exact configured', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      react: { '18.0.0': {}, '18.1.0': {}, '18.2.0': {} },
    }))

    const pkgJson: PackageJson = { dependencies: { react: '^18.0.0' } }
    const [result] = await auditDeps({ pkgJson, lag: 2, rangeSpecifier: 'exact' })

    expect(result!.declaredSpecifier).toBe('caret')
    expect(result!.specifierMismatch).toBe(true)
  })

  it('no mismatch when declared specifier matches configured rangeSpecifier', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      react: { '18.0.0': {}, '18.1.0': {}, '18.2.0': {} },
    }))

    const pkgJson: PackageJson = { dependencies: { react: '^18.0.0' } }
    const [result] = await auditDeps({ pkgJson, lag: 2, rangeSpecifier: 'caret' })

    expect(result!.specifierMismatch).toBe(false)
  })

  it('pins to oldest stable version when lag exceeds total releases', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      tiny: { '1.0.0': {}, '1.1.0': {} },
    }))

    const pkgJson: PackageJson = { dependencies: { tiny: '1.1.0' } }
    const [result] = await auditDeps({ pkgJson, lag: 10, rangeSpecifier: 'exact' })

    expect(result!.target).toBe('1.0.0')
  })

  it('uses installed version for comparison when provided', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      // registry says latest is 4.19.0, target at lag=2 is 4.17.0
      express: { '4.17.0': {}, '4.18.0': {}, '4.19.0': {} },
    }))

    // package.json declares 4.12.0 (exact) but lockfile shows 4.19.0 is actually installed
    const pkgJson: PackageJson = { dependencies: { express: '4.12.0' } }
    const [result] = await auditDeps({
      pkgJson,
      lag: 2,
      rangeSpecifier: 'exact',
      installed: { express: '4.19.0' },
    })

    // Status should be pin because installed (4.19.0) > target (4.17.0)
    expect(result!.status).toBe('pin')
    expect(result!.installed).toBe('4.19.0')
  })

  it('tilde specifier treats patch drift as ok', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      vitest: { '4.1.0': {}, '4.1.1': {}, '4.1.2': {} },
    }))

    // installed is 4.1.2, target is 4.1.0 — same minor, tilde should be ok
    const pkgJson: PackageJson = { dependencies: { vitest: '~4.1.0' } }
    const [result] = await auditDeps({
      pkgJson,
      lag: 2,
      rangeSpecifier: 'tilde',
      installed: { vitest: '4.1.2' },
    })

    expect(result!.status).toBe('ok')
  })

  it('caret specifier treats minor drift as ok', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      react: { '18.0.0': {}, '18.1.0': {}, '18.2.0': {} },
    }))

    // installed is 18.2.0, target is 18.0.0 — same major, caret should be ok
    const pkgJson: PackageJson = { dependencies: { react: '^18.0.0' } }
    const [result] = await auditDeps({
      pkgJson,
      lag: 2,
      rangeSpecifier: 'caret',
      installed: { react: '18.2.0' },
    })

    expect(result!.status).toBe('ok')
  })

  it('populates installed as null when no installed map provided', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      react: { '18.0.0': {}, '18.1.0': {}, '18.2.0': {} },
    }))

    const pkgJson: PackageJson = { dependencies: { react: '18.0.0' } }
    const [result] = await auditDeps({ pkgJson, lag: 2, rangeSpecifier: 'exact' })

    expect(result!.installed).toBeNull()
  })
})

// ─── fromCatalog ──────────────────────────────────────────────────────────────

describe('auditDeps — fromCatalog', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('marks packages in catalogPackages as fromCatalog', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      react: { '18.0.0': {}, '18.1.0': {}, '18.2.0': {} },
    }))

    const pkgJson: PackageJson = { dependencies: { react: '18.0.0' } }
    const [result] = await auditDeps({
      pkgJson,
      lag: 2,
      rangeSpecifier: 'exact',
      catalogPackages: new Set(['react']),
    })

    expect(result!.fromCatalog).toBe(true)
  })

  it('marks packages not in catalogPackages as not fromCatalog', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      react: { '18.0.0': {}, '18.1.0': {}, '18.2.0': {} },
    }))

    const pkgJson: PackageJson = { dependencies: { react: '18.0.0' } }
    const [result] = await auditDeps({
      pkgJson,
      lag: 2,
      rangeSpecifier: 'exact',
    })

    expect(result!.fromCatalog).toBe(false)
  })

  it('returns unresolved when rawVersion is a catalog ref and no installed map is provided', async () => {
    vi.stubGlobal('fetch', vi.fn())

    const pkgJson: PackageJson = { dependencies: { vitest: 'catalog:' } }
    const [result] = await auditDeps({
      pkgJson,
      lag: 1,
      rangeSpecifier: 'exact',
      catalogPackages: new Set(['vitest']),
    })

    expect(result!.status).toBe('unresolved')
    expect(result!.error).toMatch(CATALOG_REF_RE)
    expect(result!.fromCatalog).toBe(true)
  })

  it('catalog package behind target has status behind and fromCatalog true', async () => {
    vi.stubGlobal('fetch', makeRegistry({
      vitest: { '4.0.18': {}, '4.1.0': {}, '4.1.2': {} },
    }))

    // lag=1 → target is 4.1.0; declared 4.0.18 is behind it
    const pkgJson: PackageJson = { devDependencies: { vitest: '4.0.18' } }
    const [result] = await auditDeps({
      pkgJson,
      lag: 1,
      rangeSpecifier: 'exact',
      catalogPackages: new Set(['vitest']),
    })

    expect(result!.status).toBe('behind')
    expect(result!.fromCatalog).toBe(true)
    expect(result!.target).toBe('4.1.0')
  })
})

// ─── buildCatalogUpdates ──────────────────────────────────────────────────────

function makeResult(overrides: Partial<AuditResult>): AuditResult {
  return {
    name: 'pkg',
    declared: '1.0.0',
    current: '1.0.0',
    installed: null,
    target: '1.0.0',
    latest: '1.0.0',
    status: 'ok',
    rangeSpecifier: 'exact',
    declaredSpecifier: 'exact',
    specifierMismatch: false,
    fromCatalog: true,
    ...overrides,
  }
}

describe('buildCatalogUpdates', () => {
  it('writes bare version for exact specifier on pin', () => {
    const results = [makeResult({ name: 'typescript', status: 'pin', target: '5.8.3', rangeSpecifier: 'exact' })]
    expect(buildCatalogUpdates(results, 'ignore')).toEqual({ typescript: '5.8.3' })
  })

  it('applies tilde prefix for tilde specifier on pin', () => {
    const results = [makeResult({ name: 'typescript', status: 'pin', target: '5.8.3', rangeSpecifier: 'tilde' })]
    expect(buildCatalogUpdates(results, 'ignore')).toEqual({ typescript: '~5.8.3' })
  })

  it('applies caret prefix for caret specifier on pin', () => {
    const results = [makeResult({ name: 'react', status: 'pin', target: '18.1.0', rangeSpecifier: 'caret' })]
    expect(buildCatalogUpdates(results, 'ignore')).toEqual({ react: '^18.1.0' })
  })

  it('includes behind packages when behindBehavior is report', () => {
    const results = [makeResult({ name: 'react', status: 'behind', target: '18.1.0', rangeSpecifier: 'exact' })]
    expect(buildCatalogUpdates(results, 'report')).toEqual({ react: '18.1.0' })
  })

  it('excludes behind packages when behindBehavior is ignore', () => {
    const results = [makeResult({ name: 'react', status: 'behind', target: '18.1.0' })]
    expect(buildCatalogUpdates(results, 'ignore')).toEqual({})
  })

  it('excludes non-catalog packages', () => {
    const results = [makeResult({ name: 'react', status: 'pin', target: '18.1.0', fromCatalog: false })]
    expect(buildCatalogUpdates(results, 'ignore')).toEqual({})
  })

  it('applies prefix on specifierMismatch when not pin', () => {
    const results = [makeResult({ name: 'lodash', status: 'ok', current: '4.17.21', specifierMismatch: true, rangeSpecifier: 'tilde' })]
    expect(buildCatalogUpdates(results, 'ignore')).toEqual({ lodash: '~4.17.21' })
  })
})
