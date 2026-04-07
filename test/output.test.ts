import type { MonorepoPackageResult } from '../src/output.js'
import type { AuditResult } from '../src/types.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCatalogEditLines, buildInstallCmds, buildSettingsLines, buildSummaryTable, buildViolationActions, formatRangeConfig, printMonorepoResults, printResults, writeSummary } from '../src/output.js'

function makeResult(overrides: Partial<AuditResult>): AuditResult {
  return {
    name: 'pkg',
    declared: '1.0.0',
    current: '1.0.0',
    installed: null,
    target: '1.0.0',
    latest: '1.2.0',
    status: 'ok',
    rangeSpecifier: 'exact',
    declaredSpecifier: 'exact',
    specifierMismatch: false,
    fromCatalog: false,
    versionsFromLatest: null,
    ...overrides,
  }
}

const BASE_OPTS = {
  lag: 2,
  pm: 'npm' as const,
  behindBehavior: 'ignore' as const,
  rangeSpecifier: 'exact' as const,
}

describe('printResults — settings block', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('prints lag and pm in settings', () => {
    printResults({ ...BASE_OPTS, results: [] })
    const output = lines.join('\n')
    expect(output).toContain('lag')
    expect(output).toContain('npm')
  })

  it('uses singular "version" when lag is 1', () => {
    printResults({ ...BASE_OPTS, lag: 1, results: [] })
    expect(lines.join('\n')).toContain('1 version behind')
  })

  it('uses plural "versions" when lag is not 1', () => {
    printResults({ ...BASE_OPTS, lag: 2, results: [] })
    expect(lines.join('\n')).toContain('2 versions behind')
  })
})

// ─── all ok ───────────────────────────────────────────────────────────────────

describe('printResults — all ok', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('prints success message when no violations', () => {
    printResults({ ...BASE_OPTS, results: [makeResult({ status: 'ok' })] })
    expect(lines.join('\n')).toContain('all audited packages are within the lag policy')
  })
})

// ─── pin violations ───────────────────────────────────────────────────────────

describe('printResults — pin violations', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows install command for standard pin violation', () => {
    const result = makeResult({ name: 'express', status: 'pin', declared: '5.2.0', current: '5.2.0', target: '5.0.0', latest: '5.2.0', rangeSpecifier: 'exact' })
    printResults({ ...BASE_OPTS, results: [result] })
    const output = lines.join('\n')
    expect(output).toContain('to pin back')
    expect(output).toContain('express@5.0.0')
  })

  it('uses pnpm add for pnpm pm', () => {
    const result = makeResult({ name: 'express', status: 'pin', declared: '5.2.0', current: '5.2.0', target: '5.0.0', latest: '5.2.0' })
    printResults({ ...BASE_OPTS, pm: 'pnpm', results: [result] })
    expect(lines.join('\n')).toContain('pnpm add')
  })

  it('shows catalog edit block for catalog pin violation', () => {
    const result = makeResult({ name: 'typescript', status: 'pin', declared: '5.9.2', current: '5.9.2', target: '5.7.3', latest: '5.9.2', fromCatalog: true })
    printResults({ ...BASE_OPTS, results: [result], workspaceFile: 'pnpm-workspace.yaml' })
    const output = lines.join('\n')
    expect(output).toContain('to pin back')
    expect(output).toContain('typescript: 5.7.3')
  })

  it('shows confirmation message when --fix was applied', () => {
    const result = makeResult({ name: 'typescript', status: 'pin', target: '5.7.3', fromCatalog: true })
    printResults({ ...BASE_OPTS, results: [result], workspaceFile: 'pnpm-workspace.yaml', fixed: ['typescript'] })
    const output = lines.join('\n')
    expect(output).toContain('catalog updated in pnpm-workspace.yaml')
    expect(output).toContain('typescript')
    expect(output).not.toContain('--fix')
  })
})

// ─── behind behavior ─────────────────────────────────────────────────────────

describe('printResults — behind behavior', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('does not show behind packages when behindBehavior is ignore', () => {
    const result = makeResult({ name: 'lodash', status: 'behind', current: '4.17.0', target: '4.17.21' })
    printResults({ ...BASE_OPTS, behindBehavior: 'ignore', results: [result] })
    expect(lines.join('\n')).toContain('all audited packages are within the lag policy')
  })

  it('shows upgrade command for behind packages when behindBehavior is report', () => {
    const result = makeResult({ name: 'lodash', status: 'behind', declared: '4.17.0', current: '4.17.0', target: '4.17.21', latest: '4.18.0' })
    printResults({ ...BASE_OPTS, behindBehavior: 'report', results: [result] })
    const output = lines.join('\n')
    expect(output).toContain('safe to upgrade')
    expect(output).toContain('lodash@4.17.21')
  })

  it('shows catalog edit for behind catalog package when behindBehavior is report', () => {
    const result = makeResult({ name: 'vitest', status: 'behind', declared: '4.0.18', current: '4.0.18', target: '4.1.0', latest: '4.1.2', fromCatalog: true })
    printResults({ ...BASE_OPTS, behindBehavior: 'report', results: [result], workspaceFile: 'pnpm-workspace.yaml' })
    const output = lines.join('\n')
    expect(output).toContain('safe to upgrade')
    expect(output).toContain('vitest: 4.1.0')
  })
})

// ─── specifier mismatch ───────────────────────────────────────────────────────

describe('printResults — specifier mismatch', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows mismatch warning and re-pin command', () => {
    const result = makeResult({ name: 'react', status: 'ok', declared: '^18.0.0', current: '18.0.0', declaredSpecifier: 'caret', specifierMismatch: true })
    printResults({ ...BASE_OPTS, results: [result] })
    const output = lines.join('\n')
    expect(output).toContain('specifier mismatch')
    expect(output).toContain('Re-pin command')
    expect(output).toContain('react@18.0.0')
  })

  it('shows catalog edit for mismatch on catalog package', () => {
    const result = makeResult({ name: 'typescript', status: 'ok', declared: '^5.9.2', current: '5.9.2', declaredSpecifier: 'caret', specifierMismatch: true, fromCatalog: true })
    printResults({ ...BASE_OPTS, results: [result], workspaceFile: 'pnpm-workspace.yaml' })
    const output = lines.join('\n')
    expect(output).toContain('typescript: 5.9.2')
  })
})

// ─── unresolved ───────────────────────────────────────────────────────────────

describe('printResults — unresolved', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('lists unresolved packages with their error', () => {
    const result = makeResult({ name: 'no-such-pkg', status: 'unresolved', target: null, latest: null, error: 'registry fetch failed' })
    printResults({ ...BASE_OPTS, results: [result] })
    const output = lines.join('\n')
    expect(output).toContain('unresolved')
    expect(output).toContain('no-such-pkg')
    expect(output).toContain('registry fetch failed')
  })
})

// ─── printMonorepoResults ─────────────────────────────────────────────────────

describe('printMonorepoResults — settings block', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('prints lag and pm in settings', () => {
    printMonorepoResults({ ...BASE_OPTS, pm: 'pnpm', packages: [] })
    const output = lines.join('\n')
    expect(output).toContain('lag')
    expect(output).toContain('pnpm')
  })
})

describe('printMonorepoResults — all ok', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('prints success message when no violations', () => {
    const packages: MonorepoPackageResult[] = [
      { pkg: { name: 'app', dir: '/root/app' }, results: [makeResult({ status: 'ok' })] },
    ]
    printMonorepoResults({ ...BASE_OPTS, pm: 'pnpm', packages })
    expect(lines.join('\n')).toContain('all audited packages are within the lag policy')
  })

  it('prints a section header per package', () => {
    const packages: MonorepoPackageResult[] = [
      { pkg: { name: '@scope/app', dir: '/root/app' }, results: [makeResult({ name: 'react' })] },
      { pkg: { name: '@scope/lib', dir: '/root/lib' }, results: [makeResult({ name: 'lodash' })] },
    ]
    printMonorepoResults({ ...BASE_OPTS, pm: 'pnpm', packages })
    const output = lines.join('\n')
    expect(output).toContain('@scope/app')
    expect(output).toContain('@scope/lib')
  })

  it('skips packages with no results', () => {
    const packages: MonorepoPackageResult[] = [
      { pkg: { name: 'empty', dir: '/root/empty' }, results: [] },
      { pkg: { name: 'full', dir: '/root/full' }, results: [makeResult({ name: 'react' })] },
    ]
    printMonorepoResults({ ...BASE_OPTS, pm: 'pnpm', packages })
    const output = lines.join('\n')
    expect(output).not.toContain('empty')
    expect(output).toContain('full')
  })
})

describe('printMonorepoResults — pin violations', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows catalog edit block for catalog violations', () => {
    const packages: MonorepoPackageResult[] = [
      { pkg: { name: 'app', dir: '/root/app' }, results: [makeResult({ name: 'typescript', status: 'pin', target: '5.7.3', fromCatalog: true })] },
    ]
    printMonorepoResults({ ...BASE_OPTS, pm: 'pnpm', packages, workspaceFile: 'pnpm-workspace.yaml' })
    const output = lines.join('\n')
    expect(output).toContain('to pin back')
    expect(output).toContain('typescript: 5.7.3')
  })

  it('shows install command for non-catalog violations', () => {
    const packages: MonorepoPackageResult[] = [
      { pkg: { name: 'app', dir: '/root/app' }, results: [makeResult({ name: 'express', status: 'pin', declared: '5.2.0', current: '5.2.0', target: '5.0.0', latest: '5.2.0', rangeSpecifier: 'exact' })] },
    ]
    printMonorepoResults({ ...BASE_OPTS, pm: 'pnpm', packages })
    const output = lines.join('\n')
    expect(output).toContain('to pin back')
    expect(output).toContain('express@5.0.0')
  })
})

describe('printMonorepoResults — behind behavior', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows upgrade command for behind packages when behindBehavior is report', () => {
    const packages: MonorepoPackageResult[] = [
      { pkg: { name: 'app', dir: '/root/app' }, results: [makeResult({ name: 'lodash', status: 'behind', declared: '4.17.0', current: '4.17.0', target: '4.17.21', latest: '4.18.0' })] },
    ]
    printMonorepoResults({ ...BASE_OPTS, pm: 'pnpm', behindBehavior: 'report', packages })
    const output = lines.join('\n')
    expect(output).toContain('safe to upgrade')
    expect(output).toContain('lodash@4.17.21')
  })

  it('shows catalog edit for behind catalog package when behindBehavior is report', () => {
    const packages: MonorepoPackageResult[] = [
      { pkg: { name: 'app', dir: '/root/app' }, results: [makeResult({ name: 'vitest', status: 'behind', declared: '4.0.18', current: '4.0.18', target: '4.1.0', latest: '4.1.2', fromCatalog: true })] },
    ]
    printMonorepoResults({ ...BASE_OPTS, pm: 'pnpm', behindBehavior: 'report', packages, workspaceFile: 'pnpm-workspace.yaml' })
    const output = lines.join('\n')
    expect(output).toContain('safe to upgrade')
    expect(output).toContain('vitest: 4.1.0')
  })
})

// ─── writeSummary ─────────────────────────────────────────────────────────────

describe('writeSummary', () => {
  let tmpDir: string
  let summaryPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'recul-test-'))
    summaryPath = join(tmpDir, 'summary.md')
  })
  afterEach(() => rmSync(tmpDir, { recursive: true }))

  function read(): string {
    return readFileSync(summaryPath, 'utf8')
  }

  it('writes checkmark heading when no violations', () => {
    writeSummary({ results: [makeResult({ status: 'ok', versionsFromLatest: 2 })], lag: 2, behindBehavior: 'ignore', summaryPath })
    expect(read()).toContain(':white_check_mark:')
    expect(read()).toContain('2 versions behind latest')
  })

  it('writes X heading when violations exist', () => {
    writeSummary({ results: [makeResult({ status: 'pin', versionsFromLatest: 0 })], lag: 2, behindBehavior: 'ignore', summaryPath })
    expect(read()).toContain(':x:')
    expect(read()).toContain('1 violation found')
  })

  it('includes package name, target, latest and gap in table row', () => {
    writeSummary({ results: [makeResult({ name: 'express', target: '5.0.0', latest: '5.2.0', status: 'ok', versionsFromLatest: 2 })], lag: 2, behindBehavior: 'ignore', summaryPath })
    const out = read()
    expect(out).toContain('express')
    expect(out).toContain('5.0.0')
    expect(out).toContain('5.2.0')
    expect(out).toContain('2')
  })

  it('shows arrow_down status for pin', () => {
    writeSummary({ results: [makeResult({ status: 'pin', versionsFromLatest: 0 })], lag: 2, behindBehavior: 'ignore', summaryPath })
    expect(read()).toContain(':arrow_down:')
  })

  it('shows arrow_up status for behind when behindBehavior is report', () => {
    writeSummary({ results: [makeResult({ status: 'behind', versionsFromLatest: 4 })], lag: 2, behindBehavior: 'report', summaryPath })
    const out = read()
    expect(out).toContain(':arrow_up:')
    expect(out).toContain('1 violation found')
  })

  it('omits installed column when no installed versions', () => {
    writeSummary({ results: [makeResult({ installed: null })], lag: 2, behindBehavior: 'ignore', summaryPath })
    expect(read()).not.toContain('installed')
  })

  it('includes installed column when installed version present', () => {
    writeSummary({ results: [makeResult({ installed: '1.0.0' })], lag: 2, behindBehavior: 'ignore', summaryPath })
    expect(read()).toContain('installed')
  })
})

// ─── writeSummary — monorepo ──────────────────────────────────────────────────

describe('writeSummary — monorepo', () => {
  let tmpDir: string
  let summaryPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'recul-test-'))
    summaryPath = join(tmpDir, 'summary.md')
  })
  afterEach(() => rmSync(tmpDir, { recursive: true }))

  function read(): string {
    return readFileSync(summaryPath, 'utf8')
  }

  function makePackages(overrides: Partial<AuditResult>[] = []): MonorepoPackageResult[] {
    return [
      { pkg: { name: '@scope/app', dir: '/root/packages/app' }, results: [makeResult({ name: 'react', ...overrides[0] })] },
      { pkg: { name: '@scope/lib', dir: '/root/packages/lib' }, results: [makeResult({ name: 'lodash', ...overrides[1] })] },
    ]
  }

  it('writes a section heading per package', () => {
    writeSummary({ packages: makePackages(), lag: 2, behindBehavior: 'ignore', summaryPath })
    const out = read()
    expect(out).toContain('### @scope/app')
    expect(out).toContain('### @scope/lib')
  })

  it('each section contains only its own packages', () => {
    writeSummary({ packages: makePackages(), lag: 2, behindBehavior: 'ignore', summaryPath })
    const out = read()
    const appIdx = out.indexOf('### @scope/app')
    const libIdx = out.indexOf('### @scope/lib')
    const reactIdx = out.indexOf('react')
    const lodashIdx = out.indexOf('lodash')
    expect(reactIdx).toBeGreaterThan(appIdx)
    expect(reactIdx).toBeLessThan(libIdx)
    expect(lodashIdx).toBeGreaterThan(libIdx)
  })

  it('counts violations across all packages', () => {
    writeSummary({ packages: makePackages([{ status: 'pin' }, { status: 'pin' }]), lag: 2, behindBehavior: 'ignore', summaryPath })
    expect(read()).toContain('2 violations found')
  })

  it('skips packages with no results', () => {
    const packages: MonorepoPackageResult[] = [
      { pkg: { name: 'empty', dir: '/root/empty' }, results: [] },
      { pkg: { name: 'full', dir: '/root/full' }, results: [makeResult({ name: 'react' })] },
    ]
    writeSummary({ packages, lag: 2, behindBehavior: 'ignore', summaryPath })
    const out = read()
    expect(out).not.toContain('### empty')
    expect(out).toContain('### full')
  })
})

// ─── range specifier config display ──────────────────────────────────────────

describe('printResults — rangeSpecifier config display', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows per-package overrides in range setting', () => {
    printResults({ ...BASE_OPTS, rangeSpecifier: { default: 'exact', react: 'tilde' }, results: [] })
    const output = lines.join('\n')
    expect(output).toContain('react → tilde')
  })
})

// ─── formatRangeConfig ────────────────────────────────────────────────────────

describe('formatRangeConfig', () => {
  it('returns the string as-is for a simple specifier', () => {
    expect(formatRangeConfig('exact')).toBe('exact')
    expect(formatRangeConfig('caret')).toBe('caret')
  })

  it('returns default when no overrides', () => {
    expect(formatRangeConfig({ default: 'tilde' })).toBe('tilde')
  })

  it('returns exact as default when no default set', () => {
    expect(formatRangeConfig({})).toBe('exact')
  })

  it('includes overrides in the output', () => {
    expect(formatRangeConfig({ default: 'exact', react: 'tilde' })).toBe('exact (default), react → tilde')
  })

  it('lists multiple overrides comma-separated', () => {
    const result = formatRangeConfig({ default: 'exact', react: 'tilde', lodash: 'caret' })
    expect(result).toContain('react → tilde')
    expect(result).toContain('lodash → caret')
  })
})

// ─── buildInstallCmds ────────────────────────────────────────────────────────

describe('buildInstallCmds', () => {
  it('generates pnpm add -E for exact packages', () => {
    const pkgs = [makeResult({ name: 'express', target: '5.0.0', rangeSpecifier: 'exact' })]
    expect(buildInstallCmds({ pm: 'pnpm', packages: pkgs, versionTarget: 'target' })).toEqual(['pnpm add -E express@5.0.0'])
  })

  it('generates npm install -E for exact packages', () => {
    const pkgs = [makeResult({ name: 'express', target: '5.0.0', rangeSpecifier: 'exact' })]
    expect(buildInstallCmds({ pm: 'npm', packages: pkgs, versionTarget: 'target' })).toEqual(['npm install -E express@5.0.0'])
  })

  it('generates pnpm add without -E for caret packages', () => {
    const pkgs = [makeResult({ name: 'react', target: '18.0.0', rangeSpecifier: 'caret' })]
    expect(buildInstallCmds({ pm: 'pnpm', packages: pkgs, versionTarget: 'target' })).toEqual(['pnpm add react@^18.0.0'])
  })

  it('uses current version when versionTarget is current', () => {
    const pkgs = [makeResult({ name: 'react', current: '17.0.0', rangeSpecifier: 'exact' })]
    expect(buildInstallCmds({ pm: 'pnpm', packages: pkgs, versionTarget: 'current' })).toEqual(['pnpm add -E react@17.0.0'])
  })

  it('splits exact and non-exact packages into separate commands', () => {
    const pkgs = [
      makeResult({ name: 'express', target: '5.0.0', rangeSpecifier: 'exact' }),
      makeResult({ name: 'react', target: '18.0.0', rangeSpecifier: 'caret' }),
    ]
    const cmds = buildInstallCmds({ pm: 'pnpm', packages: pkgs, versionTarget: 'target' })
    expect(cmds).toHaveLength(2)
    expect(cmds[0]).toContain('-E')
    expect(cmds[1]).not.toContain('-E')
  })

  it('returns empty array for empty packages', () => {
    expect(buildInstallCmds({ pm: 'pnpm', packages: [], versionTarget: 'target' })).toEqual([])
  })
})

// ─── buildSettingsLines ───────────────────────────────────────────────────────

describe('buildSettingsLines', () => {
  const BASE = { lag: 2, pm: 'npm' as const, behindBehavior: 'ignore' as const, rangeSpecifier: 'exact' as const, sameMajor: true as const }

  it('includes lag, pm, behind, range, sameMajor lines', () => {
    const lines = buildSettingsLines(BASE)
    const out = lines.join('\n')
    expect(out).toContain('lag')
    expect(out).toContain('npm')
    expect(out).toContain('ignore')
    expect(out).toContain('exact')
    expect(out).toContain('sameMajor')
  })

  it('uses singular version when lag is 1', () => {
    expect(buildSettingsLines({ ...BASE, lag: 1 }).join('\n')).toContain('1 version behind')
  })

  it('includes minAge line when minimumReleaseAge is set', () => {
    expect(buildSettingsLines({ ...BASE, minimumReleaseAge: 3 }).join('\n')).toContain('minAge')
  })

  it('omits minAge line when minimumReleaseAge is not set', () => {
    expect(buildSettingsLines(BASE).join('\n')).not.toContain('minAge')
  })

  it('shows report description when behindBehavior is report', () => {
    expect(buildSettingsLines({ ...BASE, behindBehavior: 'report' }).join('\n')).toContain('report packages behind target')
  })

  it('shows per-pkg for object sameMajor config', () => {
    expect(buildSettingsLines({ ...BASE, sameMajor: { react: true } }).join('\n')).toContain('per-pkg')
  })

  it('shows consider all majors when sameMajor is false', () => {
    expect(buildSettingsLines({ ...BASE, sameMajor: false }).join('\n')).toContain('consider all majors')
  })
})

// ─── buildCatalogEditLines ───────────────────────────────────────────────────

describe('buildCatalogEditLines', () => {
  it('returns pin-back heading by default', () => {
    const pkgs = [makeResult({ name: 'typescript', target: '5.7.3' })]
    expect(buildCatalogEditLines({ packages: pkgs, versionTarget: 'target' }).join('\n')).toContain('to pin back (update catalog in pnpm-workspace.yaml)')
  })

  it('uses custom workspaceFile in heading', () => {
    const pkgs = [makeResult({ name: 'typescript', target: '5.7.3' })]
    expect(buildCatalogEditLines({ packages: pkgs, versionTarget: 'target', workspaceFile: 'workspace.yaml' }).join('\n')).toContain('workspace.yaml')
  })

  it('uses re-pin heading when versionTarget is current', () => {
    const pkgs = [makeResult({ name: 'typescript', current: '5.8.3' })]
    expect(buildCatalogEditLines({ packages: pkgs, versionTarget: 'current' }).join('\n')).toContain('to re-pin')
  })

  it('lists each package with its version', () => {
    const pkgs = [makeResult({ name: 'typescript', target: '5.7.3' })]
    expect(buildCatalogEditLines({ packages: pkgs, versionTarget: 'target' }).join('\n')).toContain('typescript: 5.7.3')
  })

  it('uses custom label when provided', () => {
    const pkgs = [makeResult({ name: 'vitest', target: '4.1.0' })]
    expect(buildCatalogEditLines({ packages: pkgs, versionTarget: 'target', label: 'safe to upgrade (update catalog in' }).join('\n')).toContain('safe to upgrade')
  })

  it('includes --fix hint', () => {
    const pkgs = [makeResult({ name: 'typescript', target: '5.7.3' })]
    expect(buildCatalogEditLines({ packages: pkgs, versionTarget: 'target' }).join('\n')).toContain('--fix')
  })
})

// ─── buildViolationActions ───────────────────────────────────────────────────

describe('buildViolationActions', () => {
  const BASE = { pm: 'pnpm' as const, behindBehavior: 'ignore' as const }

  it('returns empty array when no violations or behind', () => {
    expect(buildViolationActions({ ...BASE, violations: [], behind: [] })).toEqual([])
  })

  it('includes pin-back install command for standard violations', () => {
    const violations = [makeResult({ name: 'express', status: 'pin', target: '5.0.0', rangeSpecifier: 'exact' })]
    const out = buildViolationActions({ ...BASE, violations, behind: [] }).join('\n')
    expect(out).toContain('to pin back')
    expect(out).toContain('express@5.0.0')
  })

  it('includes catalog edit lines for catalog violations', () => {
    const violations = [makeResult({ name: 'typescript', status: 'pin', target: '5.7.3', fromCatalog: true })]
    const out = buildViolationActions({ ...BASE, violations, behind: [] }).join('\n')
    expect(out).toContain('typescript: 5.7.3')
  })

  it('shows fixed confirmation instead of catalog edits when fixed is provided', () => {
    const violations = [makeResult({ name: 'typescript', status: 'pin', target: '5.7.3', fromCatalog: true })]
    const out = buildViolationActions({ ...BASE, violations, behind: [], fixed: ['typescript'] }).join('\n')
    expect(out).toContain('catalog updated in')
    expect(out).toContain('typescript')
    expect(out).not.toContain('--fix')
  })

  it('includes upgrade command for behind packages when behindBehavior is report', () => {
    const behind = [makeResult({ name: 'lodash', status: 'behind', target: '4.17.21', rangeSpecifier: 'exact' })]
    const out = buildViolationActions({ ...BASE, behindBehavior: 'report', violations: [], behind }).join('\n')
    expect(out).toContain('safe to upgrade')
    expect(out).toContain('lodash@4.17.21')
  })

  it('does not include behind packages when behindBehavior is ignore', () => {
    const behind = [makeResult({ name: 'lodash', status: 'behind', target: '4.17.21' })]
    const out = buildViolationActions({ ...BASE, violations: [], behind }).join('\n')
    expect(out).not.toContain('safe to upgrade')
  })

  it('includes catalog edit for behind catalog packages when behindBehavior is report', () => {
    const behind = [makeResult({ name: 'vitest', status: 'behind', target: '4.1.0', fromCatalog: true })]
    const out = buildViolationActions({ ...BASE, behindBehavior: 'report', violations: [], behind }).join('\n')
    expect(out).toContain('safe to upgrade')
    expect(out).toContain('vitest: 4.1.0')
  })
})

// ─── buildSummaryTable ───────────────────────────────────────────────────────

describe('buildSummaryTable', () => {
  it('renders header and separator rows', () => {
    const out = buildSummaryTable([makeResult({ name: 'react' })], 'ignore').join('\n')
    expect(out).toContain('package')
    expect(out).toContain('---')
  })

  it('includes installed column when any result has installed', () => {
    const out = buildSummaryTable([makeResult({ name: 'react', installed: '18.0.0' })], 'ignore').join('\n')
    expect(out).toContain('installed')
  })

  it('omits installed column when no results have installed', () => {
    const out = buildSummaryTable([makeResult({ name: 'react', installed: null })], 'ignore').join('\n')
    expect(out).not.toContain('installed')
  })

  it('uses arrow_down label for pin status', () => {
    expect(buildSummaryTable([makeResult({ status: 'pin' })], 'ignore').join('\n')).toContain(':arrow_down:')
  })

  it('uses x label for unresolved status', () => {
    expect(buildSummaryTable([makeResult({ status: 'unresolved' })], 'ignore').join('\n')).toContain(':x: unresolved')
  })

  it('uses arrow_up label for behind when behindBehavior is report', () => {
    expect(buildSummaryTable([makeResult({ status: 'behind' })], 'report').join('\n')).toContain(':arrow_up:')
  })

  it('uses checkmark label for behind when behindBehavior is ignore', () => {
    expect(buildSummaryTable([makeResult({ status: 'behind' })], 'ignore').join('\n')).toContain(':white_check_mark:')
  })

  it('sorts results alphabetically', () => {
    const results = [makeResult({ name: 'zod' }), makeResult({ name: 'axios' })]
    const rows = buildSummaryTable(results, 'ignore')
    const dataRows = rows.slice(2)
    expect(dataRows[0]).toContain('axios')
    expect(dataRows[1]).toContain('zod')
  })
})
