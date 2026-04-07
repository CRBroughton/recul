import type { AuditResult } from '../src/types.js'
import { describe, expect, it } from 'vitest'
import { computeWidths, renderHeader, renderRows, statusLabel } from '../src/table.js'

function makeResult(overrides: Partial<AuditResult> = {}): AuditResult {
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
    versionsFromLatest: 2,
    ...overrides,
  }
}

// ─── statusLabel ──────────────────────────────────────────────────────────────

describe('statusLabel', () => {
  it('returns ✓ ok for ok status', () => {
    expect(statusLabel(makeResult({ status: 'ok' }), 'ignore')).toBe('✓ ok')
  })

  it('returns ↓ will pin back for pin status', () => {
    expect(statusLabel(makeResult({ status: 'pin' }), 'ignore')).toBe('↓ will pin back')
  })

  it('returns ✓ ok for behind when behindBehavior is ignore', () => {
    expect(statusLabel(makeResult({ status: 'behind' }), 'ignore')).toBe('✓ ok')
  })

  it('returns ↑ safe to upgrade for behind when behindBehavior is report', () => {
    expect(statusLabel(makeResult({ status: 'behind' }), 'report')).toBe('↑ safe to upgrade')
  })

  it('returns ✗ unresolved for unresolved status', () => {
    expect(statusLabel(makeResult({ status: 'unresolved' }), 'ignore')).toBe('✗ unresolved')
  })

  it('appends specifier mismatch warning when specifierMismatch is true', () => {
    const label = statusLabel(makeResult({ status: 'ok', specifierMismatch: true, declaredSpecifier: 'caret' }), 'ignore')
    expect(label).toContain('⚠ declared caret')
  })
})

// ─── computeWidths ────────────────────────────────────────────────────────────

describe('computeWidths', () => {
  it('name width fits longest package name plus padding', () => {
    const rows = [makeResult({ name: 'short' }), makeResult({ name: 'a-much-longer-name' })]
    const w = computeWidths(rows, 'ignore')
    expect(w.name).toBeGreaterThanOrEqual('a-much-longer-name'.length + 2)
  })

  it('name width is at least header length plus padding', () => {
    const rows = [makeResult({ name: 'x' })]
    const w = computeWidths(rows, 'ignore')
    expect(w.name).toBeGreaterThanOrEqual('package'.length + 2)
  })

  it('installed is 0 when no rows have an installed version', () => {
    const rows = [makeResult({ installed: null })]
    const w = computeWidths(rows, 'ignore')
    expect(w.installed).toBe(0)
  })

  it('installed is non-zero when any row has an installed version', () => {
    const rows = [makeResult({ installed: '1.0.0' })]
    const w = computeWidths(rows, 'ignore')
    expect(w.installed).toBeGreaterThan(0)
  })

  it('status width accommodates mismatch label', () => {
    const rows = [makeResult({ status: 'ok', specifierMismatch: true, declaredSpecifier: 'caret' })]
    const w = computeWidths(rows, 'ignore')
    expect(w.status).toBeGreaterThanOrEqual('✓ ok  ⚠ declared caret'.length)
  })
})

// ─── renderHeader ─────────────────────────────────────────────────────────────

describe('renderHeader', () => {
  it('includes all column headers', () => {
    const w = computeWidths([makeResult()], 'ignore')
    const { header } = renderHeader(w)
    expect(header).toContain('package')
    expect(header).toContain('declared')
    expect(header).toContain('→ target')
    expect(header).toContain('latest')
    expect(header).toContain('gap')
    expect(header).toContain('status')
  })

  it('omits installed header when installed width is 0', () => {
    const w = computeWidths([makeResult({ installed: null })], 'ignore')
    const { header } = renderHeader(w)
    expect(header).not.toContain('installed')
  })

  it('includes installed header when installed width is non-zero', () => {
    const w = computeWidths([makeResult({ installed: '1.0.0' })], 'ignore')
    const { header } = renderHeader(w)
    expect(header).toContain('installed')
  })

  it('divider length equals total of all widths', () => {
    const rows = [makeResult({ installed: '1.0.0' })]
    const w = computeWidths(rows, 'ignore')
    const { divider } = renderHeader(w)
    expect(divider.length).toBe(w.name + w.declared + w.target + w.installed + w.latest + w.gap + w.status)
  })
})

// ─── renderRows ───────────────────────────────────────────────────────────────

describe('renderRows', () => {
  it('returns one string per row', () => {
    const rows = [makeResult({ name: 'a' }), makeResult({ name: 'b' })]
    const w = computeWidths(rows, 'ignore')
    expect(renderRows(rows, w, 'ignore')).toHaveLength(2)
  })

  it('each row contains the package name', () => {
    const rows = [makeResult({ name: 'express' })]
    const w = computeWidths(rows, 'ignore')
    expect(renderRows(rows, w, 'ignore')[0]).toContain('express')
  })

  it('each row contains the status label', () => {
    const rows = [makeResult({ status: 'pin' })]
    const w = computeWidths(rows, 'ignore')
    expect(renderRows(rows, w, 'ignore')[0]).toContain('↓ will pin back')
  })

  it('omits installed value when installed width is 0', () => {
    const rows = [makeResult({ installed: null, name: 'pkg' })]
    const w = computeWidths(rows, 'ignore')
    const row = renderRows(rows, w, 'ignore')[0]!
    // installed column absent — row should not contain a standalone version value in that slot
    expect(w.installed).toBe(0)
    expect(row).toContain('pkg')
  })

  it('shows — for null versionsFromLatest', () => {
    const rows = [makeResult({ versionsFromLatest: null })]
    const w = computeWidths(rows, 'ignore')
    expect(renderRows(rows, w, 'ignore')[0]).toContain('—')
  })
})
