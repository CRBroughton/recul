import type { AuditResult } from '../src/types.js'
import { describe, expect, it } from 'vitest'

function makeResult(overrides: Partial<AuditResult>): AuditResult {
  return {
    name: 'pkg',
    declared: '1.0.0',
    current: '1.0.0',
    installed: null,
    target: '1.0.0',
    latest: '1.0.0',
    status: 'ok',
    rangeSpecifier: 'exact',
    declaredSpecifier: 'exact',
    specifierMismatch: false,
    fromCatalog: false,
    ...overrides,
  }
}

function shouldExit(results: AuditResult[], behindBehavior: 'ignore' | 'report'): boolean {
  return results.some(r =>
    r.status === 'pin'
    || r.status === 'unresolved'
    || (r.status === 'behind' && behindBehavior === 'report'),
  )
}

describe('exit code logic', () => {
  it('returns false when all packages are ok', () => {
    const results = [makeResult({ status: 'ok' }), makeResult({ name: 'other', status: 'ok' })]
    expect(shouldExit(results, 'ignore')).toBe(false)
  })

  it('returns true when any package needs pinning', () => {
    const results = [makeResult({ status: 'ok' }), makeResult({ name: 'bad', status: 'pin' })]
    expect(shouldExit(results, 'ignore')).toBe(true)
  })

  it('returns true when any package is unresolved', () => {
    const results = [makeResult({ status: 'unresolved', target: null, latest: null })]
    expect(shouldExit(results, 'ignore')).toBe(true)
  })

  it('returns false when a package is behind and behindBehavior is ignore', () => {
    const results = [makeResult({ status: 'behind' })]
    expect(shouldExit(results, 'ignore')).toBe(false)
  })

  it('returns true when a package is behind and behindBehavior is report', () => {
    const results = [makeResult({ status: 'behind' })]
    expect(shouldExit(results, 'report')).toBe(true)
  })

  it('returns true when mix of ok and pin', () => {
    const results = [
      makeResult({ name: 'a', status: 'ok' }),
      makeResult({ name: 'b', status: 'pin' }),
      makeResult({ name: 'c', status: 'ok' }),
    ]
    expect(shouldExit(results, 'ignore')).toBe(true)
  })
})
