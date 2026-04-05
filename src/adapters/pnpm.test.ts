import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadPnpmCatalog, parsePnpmLock, resolveCatalogRefs, updatePnpmCatalog } from './pnpm.js'

const PNPM_FIXTURE = `\
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true

importers:

  .:
    dependencies:
      express:
        specifier: ^5.1.0
        version: 5.1.0
      lodash:
        specifier: 4.17.21
        version: 4.17.21
    devDependencies:
      '@types/node':
        specifier: 'catalog:'
        version: 22.19.15
      typescript:
        specifier: 'catalog:'
        version: 5.9.2
      vitest:
        specifier: 'catalog:'
        version: 4.1.0(@types/node@22.19.15)(vite@6.4.1(@types/node@22.19.15))

  playground:
    dependencies:
      chalk:
        specifier: 5.5.0
        version: 5.5.0

packages:

  express@5.1.0:
    resolution: {integrity: sha512-abc}
`

describe('parsePnpmLock — root importer', () => {
  it('extracts regular dependency versions', () => {
    const map = parsePnpmLock(PNPM_FIXTURE)
    expect(map.express).toBe('5.1.0')
    expect(map.lodash).toBe('4.17.21')
  })

  it('extracts scoped package versions', () => {
    expect(parsePnpmLock(PNPM_FIXTURE)['@types/node']).toBe('22.19.15')
  })

  it('extracts catalog-resolved versions', () => {
    expect(parsePnpmLock(PNPM_FIXTURE).typescript).toBe('5.9.2')
  })

  it('strips peer-dependency suffix from version', () => {
    expect(parsePnpmLock(PNPM_FIXTURE).vitest).toBe('4.1.0')
  })

  it('does not include packages from non-root importers', () => {
    expect(parsePnpmLock(PNPM_FIXTURE).chalk).toBeUndefined()
  })
})

describe('parsePnpmLock — edge cases', () => {
  it('returns empty map when no importers section', () => {
    expect(parsePnpmLock('lockfileVersion: "9.0"\n')).toEqual({})
  })

  it('returns empty map for empty string', () => {
    expect(parsePnpmLock('')).toEqual({})
  })

  it('stops reading at packages: section', () => {
    const map = parsePnpmLock(PNPM_FIXTURE)
    expect(map['express@5.1.0']).toBeUndefined()
  })
})

const WORKSPACE_FIXTURE = `\
packages:
  - playground

catalogs:
  default:
    typescript: ^5.7.3
    "@types/node": ^22.0.0
    vitest: 4.1.0
  testing:
    jest: 29.0.0
`

describe('loadPnpmCatalog', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lag-behind-test-')) })
  afterEach(() => { rmSync(dir, { recursive: true }) })

  it('returns a catalogName → (name → specifier) map', () => {
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), WORKSPACE_FIXTURE)
    const catalogs = loadPnpmCatalog(dir)
    expect(catalogs).not.toBeNull()
    expect(catalogs!.default?.typescript).toBe('^5.7.3')
    expect(catalogs!.default?.['@types/node']).toBe('^22.0.0')
    expect(catalogs!.default?.vitest).toBe('4.1.0')
    expect(catalogs!.testing?.jest).toBe('29.0.0')
  })

  it('returns null when pnpm-workspace.yaml does not exist', () => {
    expect(loadPnpmCatalog(dir)).toBeNull()
  })

  it('returns null when there is no catalogs section', () => {
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - playground\n')
    expect(loadPnpmCatalog(dir)).toBeNull()
  })
})

describe('resolveCatalogRefs', () => {
  const catalogs = {
    default: { 'typescript': '^5.7.3', '@types/node': '^22.0.0' },
    testing: { jest: '29.0.0', vitest: '4.1.0' },
  }

  it('replaces catalog: entries with the default catalog specifier', () => {
    const result = resolveCatalogRefs({ typescript: 'catalog:', express: '5.1.0' }, catalogs)
    expect(result.typescript).toBe('^5.7.3')
    expect(result.express).toBe('5.1.0')
  })

  it('replaces catalog:<name> entries with the named catalog specifier', () => {
    const result = resolveCatalogRefs({ vitest: 'catalog:testing', jest: 'catalog:testing' }, catalogs)
    expect(result.vitest).toBe('4.1.0')
    expect(result.jest).toBe('29.0.0')
  })

  it('leaves non-catalog entries unchanged', () => {
    const result = resolveCatalogRefs({ express: '^5.1.0' }, catalogs)
    expect(result.express).toBe('^5.1.0')
  })

  it('leaves catalog: entry unchanged when name is not in catalog', () => {
    const result = resolveCatalogRefs({ unknown: 'catalog:' }, catalogs)
    expect(result.unknown).toBe('catalog:')
  })

  it('leaves catalog:<name> entry unchanged when name not found', () => {
    const result = resolveCatalogRefs({ unknown: 'catalog:testing' }, catalogs)
    expect(result.unknown).toBe('catalog:testing')
  })

  it('leaves catalog:<name> entry unchanged when catalog section does not exist', () => {
    const result = resolveCatalogRefs({ pkg: 'catalog:nonexistent' }, catalogs)
    expect(result.pkg).toBe('catalog:nonexistent')
  })
})

describe('updatePnpmCatalog', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lag-behind-test-')) })
  afterEach(() => { rmSync(dir, { recursive: true }) })

  it('rewrites matching catalog entries in place', () => {
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), WORKSPACE_FIXTURE)
    updatePnpmCatalog(dir, { typescript: '5.9.2', vitest: '4.1.0' })
    const updated = readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')
    expect(updated).toContain('typescript: 5.9.2')
    expect(updated).toContain('vitest: 4.1.0')
  })

  it('rewrites scoped package entries', () => {
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), WORKSPACE_FIXTURE)
    updatePnpmCatalog(dir, { '@types/node': '22.0.0' })
    const updated = readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')
    expect(updated).toContain('"@types/node": 22.0.0')
  })

  it('preserves lines not in the updates map', () => {
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), WORKSPACE_FIXTURE)
    updatePnpmCatalog(dir, { typescript: '5.9.2' })
    const updated = readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')
    expect(updated).toContain('"@types/node": ^22.0.0')
    expect(updated).toContain('vitest: 4.1.0')
  })
})
