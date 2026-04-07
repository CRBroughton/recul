#!/usr/bin/env node
import type { BehindBehavior, PackageJson, PackageManager } from '../src/types.js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineCommand, runMain } from 'citty'
import { defu } from 'defu'
import { destr } from 'destr'
import { auditDeps, buildCatalogUpdates } from '../src/audit.js'
import { DEFAULTS, loadConfigFile, resolveConfigDir } from '../src/config.js'
import { runInit } from '../src/init.js'
import { detectPackageManager, findWorkspaceRoot, loadLockfile, loadPnpmCatalog, npmAdapter, parsePnpmLock, pnpmAdapter, resolveCatalogRefs, resolveWorkspacePackages, updatePnpmCatalog } from '../src/lockfile.js'
import { printMonorepoResults, printResults, writeSummary } from '../src/output.js'

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
    behindBehavior: { type: 'string', description: 'Override behindBehavior from config (ignore | report)' },
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
      { file: args.file as string | undefined, behindBehavior: args.behindBehavior as BehindBehavior | undefined },
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

    // Detect monorepo: workspace root has a packages: field with entries beyond '.'
    const workspaceRoot = findWorkspaceRoot(pkgDir)
    const workspacePackages = workspaceRoot !== null ? resolveWorkspacePackages(workspaceRoot) : []
    const isMonorepo = workspacePackages.length > 0

    // Shared catalog + lockfile (always loaded from workspace root when available)
    const catalogDir = workspaceRoot ?? pkgDir
    const catalogs = loadPnpmCatalog(catalogDir)
    const catalogPackages = catalogs !== null
      ? new Set(Object.values(catalogs).flatMap(Object.keys))
      : undefined

    // Read lockfile content once from root for monorepo importer lookups
    const lockfilePath = workspaceRoot !== null
      ? `${workspaceRoot}/pnpm-lock.yaml`
      : null
    const lockfileContent = lockfilePath !== null && (await import('node:fs')).existsSync(lockfilePath)
      ? (await import('node:fs')).readFileSync(lockfilePath, 'utf8')
      : null

    if (isMonorepo && workspaceRoot !== null) {
      const packageResults = await Promise.all(
        workspacePackages.map(async (wp) => {
          let wpRaw: PackageJson | null
          try {
            wpRaw = destr<PackageJson | null>((await import('node:fs')).readFileSync(`${wp.dir}/package.json`, 'utf8'))
          }
          catch { return { pkg: wp, results: [] } }
          if (wpRaw === null || typeof wpRaw !== 'object')
            return { pkg: wp, results: [] }

          const relPath = wp.dir === workspaceRoot ? '.' : wp.dir.replace(`${workspaceRoot}/`, '')
          const installedMap = lockfileContent !== null
            ? parsePnpmLock(lockfileContent, relPath)
            : null

          const wpJson: PackageJson = catalogs !== null
            ? {
                ...(wpRaw.dependencies !== undefined ? { dependencies: resolveCatalogRefs(wpRaw.dependencies, catalogs) } : {}),
                ...(wpRaw.devDependencies !== undefined ? { devDependencies: resolveCatalogRefs(wpRaw.devDependencies, catalogs) } : {}),
              }
            : wpRaw

          const results = await auditDeps({
            pkgJson: wpJson,
            lag,
            ...(minimumReleaseAge !== undefined ? { minimumReleaseAge } : {}),
            preReleaseFilter,
            sameMajor,
            rangeSpecifier,
            ignore,
            ...(installedMap !== null ? { installed: installedMap } : {}),
            ...(catalogPackages !== undefined ? { catalogPackages } : {}),
          })
          return { pkg: wp, results }
        }),
      )

      if (args.fix && catalogPackages !== undefined) {
        const allResults = packageResults.flatMap(p => p.results)
        const updates = buildCatalogUpdates(allResults, behindBehavior)
        if (Object.keys(updates).length > 0)
          updatePnpmCatalog(workspaceRoot, updates)
      }

      printMonorepoResults({ packages: packageResults, lag, pm, behindBehavior, rangeSpecifier, sameMajor, ...(minimumReleaseAge !== undefined ? { minimumReleaseAge } : {}), ...(catalogPackages !== undefined ? { workspaceFile: 'pnpm-workspace.yaml' } : {}) })

      const summaryPath = process.env.GITHUB_STEP_SUMMARY
      if (summaryPath !== undefined)
        writeSummary({ packages: packageResults, lag, behindBehavior, summaryPath })

      const hasViolations = packageResults.flatMap(p => p.results).some(r =>
        r.status === 'pin'
        || r.status === 'unresolved'
        || (r.status === 'behind' && behindBehavior === 'report'),
      )
      if (hasViolations)
        process.exit(1)
      return
    }

    // Single-package mode
    const base = raw
    const pkgJson: PackageJson = catalogs !== null
      ? {
          ...(base.dependencies !== undefined ? { dependencies: resolveCatalogRefs(base.dependencies, catalogs) } : {}),
          ...(base.devDependencies !== undefined ? { devDependencies: resolveCatalogRefs(base.devDependencies, catalogs) } : {}),
        }
      : base
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
      const updates = buildCatalogUpdates(results, behindBehavior)
      if (Object.keys(updates).length > 0) {
        updatePnpmCatalog(pkgDir, updates)
        fixed = Object.keys(updates)
      }
    }

    printResults({ results, lag, pm, behindBehavior, rangeSpecifier, sameMajor, ...(minimumReleaseAge !== undefined ? { minimumReleaseAge } : {}), ...(catalogPackages !== undefined ? { workspaceFile: 'pnpm-workspace.yaml' } : {}), ...(fixed !== undefined ? { fixed } : {}) })

    const summaryPath = process.env.GITHUB_STEP_SUMMARY
    if (summaryPath !== undefined)
      writeSummary({ results, lag, behindBehavior, summaryPath })

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
