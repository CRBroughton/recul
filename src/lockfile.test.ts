import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectPackageManager, loadLockfile, npmAdapter, pnpmAdapter } from './lockfile.js'

describe('loadLockfile', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'recul-test-')) })
  afterEach(() => { rmSync(dir, { recursive: true }) })

  it('returns null when no lockfile is found', () => {
    expect(loadLockfile({ dir, adapters: [npmAdapter, pnpmAdapter] })).toBeNull()
  })

  it('parses package-lock.json when present', () => {
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3,
      packages: { 'node_modules/express': { version: '5.0.0' } },
    }))
    const map = loadLockfile({ dir, adapters: [npmAdapter, pnpmAdapter] })
    expect(map).not.toBeNull()
    expect(map!.express).toBe('5.0.0')
  })

  it('parses pnpm-lock.yaml when present', () => {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), `\
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      express:
        specifier: 5.0.0
        version: 5.0.0
`)
    const map = loadLockfile({ dir, adapters: [npmAdapter, pnpmAdapter] })
    expect(map).not.toBeNull()
    expect(map!.express).toBe('5.0.0')
  })

  it('uses the first matching adapter when both lockfiles exist', () => {
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3,
      packages: { 'node_modules/express': { version: '4.0.0' } },
    }))
    writeFileSync(join(dir, 'pnpm-lock.yaml'), `\
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      express:
        specifier: 5.0.0
        version: 5.0.0
`)
    const map = loadLockfile({ dir, adapters: [npmAdapter, pnpmAdapter] })
    expect(map!.express).toBe('4.0.0')
  })

  it('returns empty map for unrecognised lockfile content', () => {
    writeFileSync(join(dir, 'package-lock.json'), 'not json')
    expect(loadLockfile({ dir, adapters: [npmAdapter] })).toEqual({})
  })
})

describe('detectPackageManager', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'recul-test-')) })
  afterEach(() => { rmSync(dir, { recursive: true }) })

  it('returns null when no lockfile or packageManager field exists', () => {
    expect(detectPackageManager(dir)).toBeNull()
  })

  it('detects pnpm from pnpm-lock.yaml', () => {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '')
    expect(detectPackageManager(dir)).toBe('pnpm')
  })

  it('detects npm from package-lock.json', () => {
    writeFileSync(join(dir, 'package-lock.json'), '{}')
    expect(detectPackageManager(dir)).toBe('npm')
  })

  it('pnpm-lock.yaml takes precedence over package-lock.json', () => {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '')
    writeFileSync(join(dir, 'package-lock.json'), '{}')
    expect(detectPackageManager(dir)).toBe('pnpm')
  })

  it('reads packageManager field from package.json as fallback', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ packageManager: 'pnpm@9.0.0' }))
    expect(detectPackageManager(dir)).toBe('pnpm')
  })

  it('strips the version suffix from the packageManager field', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ packageManager: 'pnpm@9.0.0' }))
    expect(detectPackageManager(dir)).toBe('pnpm')
  })

  it('returns null for an unrecognised packageManager field value', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ packageManager: 'rush@5.0.0' }))
    expect(detectPackageManager(dir)).toBeNull()
  })
})
