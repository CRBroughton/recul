import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findWorkspaceRoot, loadPnpmCatalog, parsePnpmLock, resolveCatalogRefs, resolveWorkspacePackages, updatePnpmCatalog } from './pnpm.js'

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

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'recul-test-')) })
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

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'recul-test-')) })
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

// ─── parsePnpmLock — importer ─────────────────────────────────────────────────

describe('parsePnpmLock — importer', () => {
  const MONOREPO_LOCK = `\
lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      express:
        specifier: ^5.0.0
        version: 5.0.0

  packages/app1:
    dependencies:
      react:
        specifier: ^18.0.0
        version: 18.0.0
`

  it('reads from root importer by default', () => {
    const map = parsePnpmLock(MONOREPO_LOCK)
    expect(map.express).toBe('5.0.0')
    expect(map.react).toBeUndefined()
  })

  it('reads from a named importer when specified', () => {
    const map = parsePnpmLock(MONOREPO_LOCK, 'packages/app1')
    expect(map.react).toBe('18.0.0')
    expect(map.express).toBeUndefined()
  })

  it('returns empty map when importer does not exist', () => {
    const map = parsePnpmLock(MONOREPO_LOCK, 'packages/missing')
    expect(Object.keys(map)).toHaveLength(0)
  })
})

// ─── findWorkspaceRoot ────────────────────────────────────────────────────────

describe('findWorkspaceRoot', () => {
  let root: string

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'recul-test-')) })
  afterEach(() => { rmSync(root, { recursive: true }) })

  it('returns the directory containing pnpm-workspace.yaml with packages field', () => {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    expect(findWorkspaceRoot(root)).toBe(root)
  })

  it('walks up to find the workspace root from a subdirectory', () => {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    const sub = join(root, 'packages', 'app1')
    mkdirSync(sub, { recursive: true })
    expect(findWorkspaceRoot(sub)).toBe(root)
  })

  it('returns null when no pnpm-workspace.yaml is found', () => {
    expect(findWorkspaceRoot(root)).toBeNull()
  })

  it('returns null when pnpm-workspace.yaml has no packages field', () => {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'catalogs:\n  default:\n    react: 18.0.0\n')
    expect(findWorkspaceRoot(root)).toBeNull()
  })
})

// ─── resolveWorkspacePackages ─────────────────────────────────────────────────

describe('resolveWorkspacePackages', () => {
  let root: string

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'recul-test-')) })
  afterEach(() => { rmSync(root, { recursive: true }) })

  it('expands wildcard patterns to workspace packages', () => {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    const pkgDir = join(root, 'packages', 'app1')
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@scope/app1' }))
    const result = resolveWorkspacePackages(root)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('@scope/app1')
    expect(result[0]!.dir).toBe(pkgDir)
  })

  it('skips directories without a package.json', () => {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    mkdirSync(join(root, 'packages', 'no-pkg'), { recursive: true })
    expect(resolveWorkspacePackages(root)).toHaveLength(0)
  })

  it('handles literal paths', () => {
    const pkgDir = join(root, 'playground')
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: 'playground' }))
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - playground\n')
    const result = resolveWorkspacePackages(root)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('playground')
  })

  it('includes . (root) as a workspace package when package.json exists', () => {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@scope/root' }))
    const result = resolveWorkspacePackages(root)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('@scope/root')
    expect(result[0]!.dir).toBe(root)
  })

  it('skips exclusion patterns', () => {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "!**/test/**"\n')
    expect(resolveWorkspacePackages(root)).toHaveLength(0)
  })

  it('falls back to directory name when package.json has no name', () => {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    const pkgDir = join(root, 'packages', 'mylib')
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), '{}')
    const result = resolveWorkspacePackages(root)
    expect(result[0]!.name).toBe('mylib')
  })
})
