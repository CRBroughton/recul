#!/usr/bin/env node
import type { PackageJson, PackageManager } from '../src/types.js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineCommand, runMain } from 'citty'
import { defu } from 'defu'
import { destr } from 'destr'
import { auditDeps } from '../src/audit.js'
import { DEFAULTS, loadConfigFile, resolveConfigDir } from '../src/config.js'
import { runInit } from '../src/init.js'
import { detectPackageManager, loadLockfile, loadPnpmCatalog, npmAdapter, pnpmAdapter, resolveCatalogRefs, updatePnpmCatalog } from '../src/lockfile.js'
import { printResults } from '../src/output.js'

const initCommand = defineCommand({
  meta: { name: 'init', description: 'Create recul.config.jsonc with recommended settings' },
  run() {
    runInit(process.cwd())
  },
})

const main = defineCommand({
  meta: { name: 'recul', description: 'Stay N versions behind latest' },
  args: {
    file: { type: 'string', alias: 'f', description: 'Path to package.json (default: package.json)' },
    fix: { type: 'boolean', description: 'Apply catalog fixes directly to pnpm-workspace.yaml' },
  },
  subCommands: { init: initCommand },
  async run({ args }) {
    const configDir = resolveConfigDir({ ...(args.file !== undefined ? { file: args.file } : {}), cwd: process.cwd() })
    const fileConfig = loadConfigFile(configDir)

    if (fileConfig === null) {
      console.error('no config file found or config could not be parsed.\n')
      console.error('run "recul init" to create recul.config.jsonc with recommended settings.')
      process.exit(1)
    }

    const detectedPm = detectPackageManager(configDir)

    const config = defu(
      { file: args.file as string | undefined },
      { lag: fileConfig.lag, file: fileConfig.packageFile, pm: fileConfig.packageManager as PackageManager | undefined, behindBehavior: fileConfig.behindBehavior, rangeSpecifier: fileConfig.rangeSpecifier, ignore: fileConfig.ignore, minimumReleaseAge: fileConfig.minimumReleaseAge, preReleaseFilter: fileConfig.preReleaseFilter, sameMajor: fileConfig.sameMajor },
      { pm: detectedPm ?? undefined },
      DEFAULTS,
    )

    const { lag, file, pm, behindBehavior, rangeSpecifier, ignore, preReleaseFilter, sameMajor } = config
    const minimumReleaseAge = config.minimumReleaseAge !== null ? config.minimumReleaseAge : undefined

    const pkgPath = resolve(process.cwd(), file)

    let raw: PackageJson | null
    try {
      raw = destr<PackageJson | null>(readFileSync(pkgPath, 'utf8'))
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`error: could not read ${pkgPath}: ${message}`)
      process.exit(1)
    }
    if (raw === null || typeof raw !== 'object') {
      console.error(`error: ${pkgPath} is not a JSON object`)
      process.exit(1)
    }

    const pkgDir = dirname(pkgPath)
    const base = raw
    const catalogs = loadPnpmCatalog(pkgDir)
    const pkgJson: PackageJson = catalogs !== null
      ? {
          ...(base.dependencies !== undefined ? { dependencies: resolveCatalogRefs(base.dependencies, catalogs) } : {}),
          ...(base.devDependencies !== undefined ? { devDependencies: resolveCatalogRefs(base.devDependencies, catalogs) } : {}),
        }
      : base
    const catalogPackages = catalogs !== null
      ? new Set(Object.values(catalogs).flatMap(Object.keys))
      : undefined
    const installedMap = loadLockfile({ dir: pkgDir, adapters: [npmAdapter, pnpmAdapter] })
    const results = await auditDeps({
      pkgJson,
      lag,
      ...(minimumReleaseAge !== undefined ? { minimumReleaseAge } : {}),
      preReleaseFilter,
      sameMajor,
      rangeSpecifier,
      ignore,
      ...(installedMap !== null ? { installed: installedMap } : {}),
      ...(catalogPackages !== undefined ? { catalogPackages } : {}),
    })
    let fixed: string[] | undefined
    if (args.fix && catalogPackages !== undefined) {
      const updates: Record<string, string> = {}
      for (const r of results) {
        if (!r.fromCatalog)
          continue
        if (r.status === 'pin' && r.target !== null)
          updates[r.name] = r.target
        else if (r.status === 'behind' && behindBehavior === 'report' && r.target !== null)
          updates[r.name] = r.target
        else if (r.specifierMismatch && r.status !== 'pin')
          updates[r.name] = r.current
      }
      if (Object.keys(updates).length > 0) {
        updatePnpmCatalog(pkgDir, updates)
        fixed = Object.keys(updates)
      }
    }

    printResults({ results, lag, pm, behindBehavior, rangeSpecifier, sameMajor, ...(minimumReleaseAge !== undefined ? { minimumReleaseAge } : {}), ...(catalogPackages !== undefined ? { workspaceFile: 'pnpm-workspace.yaml' } : {}), ...(fixed !== undefined ? { fixed } : {}) })

    const hasViolations = results.some(r =>
      r.status === 'pin'
      || r.status === 'unresolved'
      || (r.status === 'behind' && behindBehavior === 'report'),
    )
    if (hasViolations)
      process.exit(1)
  },
})

runMain(main)
