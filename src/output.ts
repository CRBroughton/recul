import type { AuditResult, BehindBehavior, PackageManager, RangeSpecifier, RangeSpecifierConfig, SameMajorConfig, WorkspacePackage } from './types.js'
import { appendFileSync } from 'node:fs'
import { rangePrefix } from './config.js'
import { computeWidths, renderHeader, renderRows } from './table.js'

// ─── pure builders ────────────────────────────────────────────────────────────

function buildInstallCmd({
  pm,
  packages,
  versionFn,
  exact = false,
}: {
  pm: PackageManager
  packages: AuditResult[]
  versionFn: (r: AuditResult) => string
  exact?: boolean
}): string {
  const pkgs = packages.map(r => `${r.name}@${versionFn(r)}`).join(' ')
  const e = exact ? ' -E' : ''
  switch (pm) {
    case 'pnpm': return `pnpm add${e} ${pkgs}`
    case 'npm': return `npm install${e} ${pkgs}`
  }
}

export function buildInstallCmds({
  pm,
  packages,
  versionTarget,
}: {
  pm: PackageManager
  packages: AuditResult[]
  versionTarget: 'target' | 'current'
}): string[] {
  const ver = (r: AuditResult, specifier: RangeSpecifier) =>
    `${rangePrefix(specifier)}${versionTarget === 'current' ? r.current : r.target ?? ''}`

  const exact = packages.filter(r => r.rangeSpecifier === 'exact')
  const nonExact = packages.filter(r => r.rangeSpecifier !== 'exact')
  const cmds: string[] = []

  if (exact.length > 0)
    cmds.push(buildInstallCmd({ pm, packages: exact, versionFn: r => ver(r, 'exact'), exact: true }))
  if (nonExact.length > 0)
    cmds.push(buildInstallCmd({ pm, packages: nonExact, versionFn: r => ver(r, r.rangeSpecifier) }))

  return cmds
}

export function formatRangeConfig(config: RangeSpecifierConfig): string {
  if (typeof config === 'string')
    return config
  const def = config.default ?? 'exact'
  const overrides = Object.entries(config)
    .filter(([k]) => k !== 'default')
    .map(([k, v]) => `${k} → ${v}`)
    .join(', ')
  return overrides ? `${def} (default), ${overrides}` : def
}

export function buildSettingsLines({
  lag,
  pm,
  behindBehavior,
  rangeSpecifier,
  minimumReleaseAge,
  sameMajor,
}: {
  lag: number
  pm: PackageManager
  behindBehavior: BehindBehavior
  rangeSpecifier: RangeSpecifierConfig
  minimumReleaseAge?: number
  sameMajor: SameMajorConfig
}): string[] {
  const behindDesc = behindBehavior === 'report'
    ? 'report packages behind target'
    : 'ignore packages behind target'
  const rangeDesc: Record<RangeSpecifier, string> = {
    exact: 'pin exact versions',
    caret: 'allow minor/patch drift (^)',
    tilde: 'allow patch drift (~)',
  }
  const rangeVal = formatRangeConfig(rangeSpecifier)
  const hasOverrides = typeof rangeSpecifier !== 'string'
    && Object.keys(rangeSpecifier).some(k => k !== 'default')
  const effectiveDefault: RangeSpecifier = typeof rangeSpecifier === 'string'
    ? rangeSpecifier
    : (rangeSpecifier.default ?? 'exact')
  const rangeNote = hasOverrides ? 'per-package specifiers configured' : rangeDesc[effectiveDefault]

  const col = (s: string) => s.padEnd(10)
  const lines = [
    'settings',
    `  ${col('lag')}${col(String(lag))};  stay ${lag} version${lag === 1 ? '' : 's'} behind latest`,
    `  ${col('pm')}${col(pm)};  the chosen package manager`,
    `  ${col('behind')}${col(behindBehavior)};  ${behindDesc}`,
    `  ${col('range')}${rangeVal};  ${rangeNote}`,
  ]
  if (minimumReleaseAge !== undefined)
    lines.push(`  ${col('minAge')}${col(String(minimumReleaseAge))};  skip versions published within the last ${minimumReleaseAge} day${minimumReleaseAge === 1 ? '' : 's'}`)
  const sameMajorVal = typeof sameMajor === 'boolean' ? String(sameMajor) : 'per-pkg'
  lines.push(`  ${col('sameMajor')}${col(sameMajorVal)};  ${typeof sameMajor === 'boolean' ? (sameMajor ? 'restrict candidates to current major' : 'consider all majors') : 'per-package major restriction'}`)
  return lines
}

export function buildCatalogEditLines({
  packages,
  versionTarget,
  workspaceFile = 'pnpm-workspace.yaml',
  label,
}: {
  packages: AuditResult[]
  versionTarget: 'target' | 'current'
  workspaceFile?: string
  label?: string
}): string[] {
  const heading = label
    ?? (versionTarget === 'target' ? 'to pin back (update catalog in' : 'to re-pin (update catalog in')
  const lines = [`\n${heading} ${workspaceFile}):`]
  for (const r of packages) {
    const ver = versionTarget === 'target' ? r.target : r.current
    if (ver)
      lines.push(`  ${r.name}: ${ver}`)
  }
  lines.push(`\n  or run with --fix to apply automatically`)
  return lines
}

export function buildViolationActions({
  pm,
  violations,
  behind,
  behindBehavior,
  workspaceFile,
  fixed,
}: {
  pm: PackageManager
  violations: AuditResult[]
  behind: AuditResult[]
  behindBehavior: BehindBehavior
  workspaceFile?: string
  fixed?: string[]
}): string[] {
  const lines: string[] = []
  const standardViolations = violations.filter(r => !r.fromCatalog)
  const catalogViolations = violations.filter(r => r.fromCatalog)

  if (standardViolations.length > 0) {
    lines.push('\nto pin back:')
    for (const cmd of buildInstallCmds({ pm, packages: standardViolations, versionTarget: 'target' }))
      lines.push(`  ${cmd}`)
  }
  if (catalogViolations.length > 0) {
    if (fixed !== undefined && fixed.length > 0) {
      const file = workspaceFile ?? 'pnpm-workspace.yaml'
      lines.push(`\ncatalog updated in ${file}:`)
      for (const name of fixed) lines.push(`  ${name}`)
    }
    else {
      lines.push(...buildCatalogEditLines({ packages: catalogViolations, versionTarget: 'target', ...(workspaceFile !== undefined ? { workspaceFile } : {}) }))
    }
  }
  if (behindBehavior === 'report' && behind.length > 0) {
    const standardBehind = behind.filter(r => !r.fromCatalog)
    const catalogBehind = behind.filter(r => r.fromCatalog)
    if (standardBehind.length > 0) {
      lines.push('\nsafe to upgrade (currently behind lag target):')
      for (const cmd of buildInstallCmds({ pm, packages: standardBehind, versionTarget: 'target' }))
        lines.push(`  ${cmd}`)
    }
    if (catalogBehind.length > 0) {
      lines.push(...buildCatalogEditLines({ packages: catalogBehind, versionTarget: 'target', label: 'safe to upgrade (update catalog in', ...(workspaceFile !== undefined ? { workspaceFile } : {}) }))
    }
  }
  return lines
}

export function buildSummaryTable(results: AuditResult[], behindBehavior: BehindBehavior): string[] {
  const sorted = results.toSorted((a, b) => a.name.localeCompare(b.name))
  const hasInstalled = results.some(r => r.installed !== null)
  const lines: string[] = []

  const header = ['package', 'declared', '→ target', ...(hasInstalled ? ['installed'] : []), 'latest', 'gap', 'status']
  const separator = header.map(() => '---')
  lines.push(`| ${header.join(' | ')} |`)
  lines.push(`| ${separator.join(' | ')} |`)

  for (const r of sorted) {
    let statusLabel: string
    if (r.status === 'pin')
      statusLabel = ':arrow_down: will pin back'
    else if (r.status === 'unresolved')
      statusLabel = ':x: unresolved'
    else if (r.status === 'behind' && behindBehavior === 'report')
      statusLabel = ':arrow_up: safe to upgrade'
    else
      statusLabel = ':white_check_mark: ok'

    const cells = [
      r.name,
      r.declared,
      r.target ?? '—',
      ...(hasInstalled ? [r.installed ?? '—'] : []),
      r.latest ?? '—',
      r.versionsFromLatest !== null ? String(r.versionsFromLatest) : '—',
      statusLabel,
    ]
    lines.push(`| ${cells.join(' | ')} |`)
  }

  return lines
}

// ─── print functions ──────────────────────────────────────────────────────────

export interface PrintResultsOptions {
  results: AuditResult[]
  lag: number
  pm: PackageManager
  behindBehavior: BehindBehavior
  rangeSpecifier: RangeSpecifierConfig
  sameMajor?: SameMajorConfig
  minimumReleaseAge?: number
  workspaceFile?: string
  fixed?: string[]
}

export function printResults({ results, lag, pm, behindBehavior, rangeSpecifier, sameMajor = true, minimumReleaseAge, workspaceFile, fixed }: PrintResultsOptions): void {
  const violations = results.filter(r => r.status === 'pin')
  const behind = results.filter(r => r.status === 'behind')
  const unresolved = results.filter(r => r.status === 'unresolved')
  const mismatches = results.filter(r => r.specifierMismatch)
  const mismatchesOnly = mismatches.filter(r => r.status !== 'pin')
  const catalogMismatches = mismatchesOnly.filter(r => r.fromCatalog)
  const standardMismatches = mismatchesOnly.filter(r => !r.fromCatalog)
  const hasActions = violations.length > 0 || (behindBehavior === 'report' && behind.length > 0)

  console.log(`\nrecul  staying ${lag} version${lag === 1 ? '' : 's'} behind latest\n`)
  for (const line of buildSettingsLines({ lag, pm, behindBehavior, rangeSpecifier, sameMajor, ...(minimumReleaseAge !== undefined ? { minimumReleaseAge } : {}) }))
    console.log(line)
  console.log()

  const sorted = results.toSorted((a, b) => a.name.localeCompare(b.name))
  const w = computeWidths(sorted, behindBehavior)
  const { header, divider } = renderHeader(w)
  console.log(header)
  console.log(divider)
  for (const row of renderRows(sorted, w, behindBehavior))
    console.log(row)

  if (unresolved.length > 0) {
    console.log('\nunresolved:')
    for (const r of unresolved) console.log(`  ${r.name}: ${r.error}`)
  }

  if (mismatches.length > 0) {
    console.log()
    const names = mismatches.map(r => r.name).join(', ')
    console.log(`⚠  specifier mismatch on: ${names}`)
    console.log(`   These packages are declared with a different range than configured.`)
    if (mismatchesOnly.length > 0)
      console.log(`   Re-pin command included below.`)
  }

  if (!hasActions && mismatches.length === 0) {
    console.log('\nall audited packages are within the lag policy ✓\n')
    return
  }

  if (!hasActions && mismatchesOnly.length > 0) {
    if (standardMismatches.length > 0) {
      for (const cmd of buildInstallCmds({ pm, packages: standardMismatches, versionTarget: 'current' }))
        console.log(`\nto re-pin:\n  ${cmd}`)
    }
    if (catalogMismatches.length > 0) {
      for (const line of buildCatalogEditLines({ packages: catalogMismatches, versionTarget: 'current', ...(workspaceFile !== undefined ? { workspaceFile } : {}) }))
        console.log(line)
    }
    console.log()
    return
  }

  for (const line of buildViolationActions({ pm, violations, behind, behindBehavior, ...(workspaceFile !== undefined ? { workspaceFile } : {}), ...(fixed !== undefined ? { fixed } : {}) }))
    console.log(line)

  if (standardMismatches.length > 0) {
    console.log(`\nto re-pin:`)
    for (const cmd of buildInstallCmds({ pm, packages: standardMismatches, versionTarget: 'current' }))
      console.log(`  ${cmd}`)
  }
  if (catalogMismatches.length > 0) {
    for (const line of buildCatalogEditLines({ packages: catalogMismatches, versionTarget: 'current', ...(workspaceFile !== undefined ? { workspaceFile } : {}) }))
      console.log(line)
  }

  console.log()
}

export interface MonorepoPackageResult {
  pkg: WorkspacePackage
  results: AuditResult[]
}

export function printMonorepoResults({
  packages,
  lag,
  pm,
  behindBehavior,
  rangeSpecifier,
  sameMajor = true,
  minimumReleaseAge,
  workspaceFile,
}: Omit<PrintResultsOptions, 'results'> & { packages: MonorepoPackageResult[] }): void {
  const allResults = packages.flatMap(p => p.results)
  const violations = allResults.filter(r => r.status === 'pin')
  const behind = allResults.filter(r => r.status === 'behind')
  const hasActions = violations.length > 0 || (behindBehavior === 'report' && behind.length > 0)

  console.log(`\nrecul  staying ${lag} version${lag === 1 ? '' : 's'} behind latest\n`)
  for (const line of buildSettingsLines({ lag, pm, behindBehavior, rangeSpecifier, sameMajor, ...(minimumReleaseAge !== undefined ? { minimumReleaseAge } : {}) }))
    console.log(line)
  console.log()

  const w = computeWidths(allResults, behindBehavior)
  const { header, divider } = renderHeader(w)

  for (const { pkg, results } of packages) {
    if (results.length === 0)
      continue
    const sorted = results.toSorted((a, b) => a.name.localeCompare(b.name))
    console.log(`─── ${pkg.name} ${'─'.repeat(Math.max(0, divider.length - pkg.name.length - 5))}`)
    console.log(header)
    console.log(divider)
    for (const row of renderRows(sorted, w, behindBehavior))
      console.log(row)
    console.log()
  }

  if (!hasActions) {
    console.log('all audited packages are within the lag policy ✓\n')
    return
  }

  for (const line of buildViolationActions({ pm, violations, behind, behindBehavior, ...(workspaceFile !== undefined ? { workspaceFile } : {}) }))
    console.log(line)
  console.log()
}

export function writeSummary({ results, packages, lag, behindBehavior, summaryPath }: {
  results?: AuditResult[]
  packages?: MonorepoPackageResult[]
  lag: number
  behindBehavior: BehindBehavior
  summaryPath: string
}): void {
  const allResults = packages !== undefined ? packages.flatMap(p => p.results) : (results ?? [])
  const violations = allResults.filter(r => r.status === 'pin' || r.status === 'unresolved' || (r.status === 'behind' && behindBehavior === 'report'))
  const icon = violations.length > 0 ? ':x:' : ':white_check_mark:'

  const lines: string[] = []
  lines.push(`## ${icon} recul — staying ${lag} version${lag === 1 ? '' : 's'} behind latest\n`)

  if (packages !== undefined) {
    for (const { pkg, results: pkgResults } of packages) {
      if (pkgResults.length === 0)
        continue
      lines.push(`### ${pkg.name}\n`)
      lines.push(...buildSummaryTable(pkgResults, behindBehavior))
      lines.push('')
    }
  }
  else {
    lines.push(...buildSummaryTable(allResults, behindBehavior))
  }

  if (violations.length === 0) {
    lines.push('\n> All audited packages are within the lag policy.')
  }
  else {
    lines.push(`\n> **${violations.length} violation${violations.length === 1 ? '' : 's'} found.** Run \`recul --fix\` to apply catalog fixes or see the install commands in the workflow log.`)
  }

  appendFileSync(summaryPath, `${lines.join('\n')}\n`)
}
