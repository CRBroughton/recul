import type { AuditResult } from '../src/types.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { printResults, writeSummary } from '../src/output.js'

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

// ─── installed column ─────────────────────────────────────────────────────────

describe('printResults — installed column', () => {
  let lines: string[]

  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows installed column header when any result has an installed version', () => {
    const result = makeResult({ name: 'express', installed: '5.0.0' })
    printResults({ ...BASE_OPTS, results: [result] })
    expect(lines.join('\n')).toContain('installed')
  })

  it('omits installed column when no results have an installed version', () => {
    const result = makeResult({ name: 'express', installed: null })
    printResults({ ...BASE_OPTS, results: [result] })
    expect(lines.join('\n')).not.toContain('installed')
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
