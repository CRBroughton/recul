import type { InstalledVersionMap, PackageManager } from './types.js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { destr } from 'destr'

export { npmAdapter, parseNpmLock } from './adapters/npm.js'
export { loadPnpmCatalog, parsePnpmLock, pnpmAdapter, resolveCatalogRefs, updatePnpmCatalog } from './adapters/pnpm.js'

export interface LockfileAdapter {
  /** Filename to look for relative to the package.json directory. */
  filename: string
  /** Parse lockfile content into a name → version map. */
  parse: (content: string) => InstalledVersionMap
}

/**
 * Try each adapter in order, returning the first successfully parsed map.
 * Returns null if no matching lockfile is found.
 */
export function loadLockfile({
  dir,
  adapters,
}: {
  dir: string
  adapters: LockfileAdapter[]
}): InstalledVersionMap | null {
  for (const adapter of adapters) {
    const path = resolve(dir, adapter.filename)
    if (!existsSync(path))
      continue
    try {
      return adapter.parse(readFileSync(path, 'utf8'))
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`error: could not parse ${path}: ${message}`)
      return null
    }
  }
  return null
}

const PM_LOCKFILES: Array<[string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['package-lock.json', 'npm'],
]

/**
 * Detect the package manager used in `dir` by checking for known lockfiles,
 * then falling back to the `packageManager` field in `package.json`.
 * Returns null if detection fails.
 */
export function detectPackageManager(dir: string): PackageManager | null {
  for (const [filename, pm] of PM_LOCKFILES) {
    if (existsSync(resolve(dir, filename)))
      return pm
  }
  const pkgPath = resolve(dir, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = destr(readFileSync(pkgPath, 'utf8'))
    if (typeof pkg === 'object' && pkg !== null && 'packageManager' in pkg) {
      const field = (pkg as Record<string, unknown>).packageManager
      if (typeof field === 'string') {
        const name = field.split('@')[0]
        if (name === 'npm' || name === 'pnpm')
          return name
      }
    }
  }
  return null
}
