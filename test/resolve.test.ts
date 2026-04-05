import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../src/config.js'
import { computeTarget, fetchStableVersions, resolvePackage } from '../src/resolve.js'

const DAY_MS = 86_400_000
const PRE_RELEASE_FILTER = DEFAULTS.preReleaseFilter

describe('computeTarget', () => {
  it('returns version at index (length - 1 - lag)', () => {
    expect(computeTarget({ versions: ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0'], lag: 2 })).toBe('1.2.0')
  })

  it('returns oldest version when lag exceeds available releases', () => {
    expect(computeTarget({ versions: ['1.0.0', '1.1.0'], lag: 5 })).toBe('1.0.0')
  })

  it('returns the only version when lag >= 1 and only one release exists', () => {
    expect(computeTarget({ versions: ['1.0.0'], lag: 2 })).toBe('1.0.0')
  })

  it('returns null for empty version list', () => {
    expect(computeTarget({ versions: [], lag: 2 })).toBeNull()
  })

  it('returns second-to-last for lag of 1', () => {
    expect(computeTarget({ versions: ['1.0.0', '1.1.0', '1.2.0', '1.3.0'], lag: 1 })).toBe('1.2.0')
  })
})

// ─── fetchStableVersions ──────────────────────────────────────────────────────

describe('fetchStableVersions', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns stable versions in publish order', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ versions: { '1.0.0': {}, '1.1.0': {}, '2.0.0-beta.1': {} } }), { status: 200 }),
    ))
    const versions = await fetchStableVersions('some-pkg', undefined, PRE_RELEASE_FILTER)
    expect(versions).toEqual(['1.0.0', '1.1.0'])
  })

  it('filters out pre-release versions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ versions: { '1.0.0-alpha': {}, '1.0.0': {}, '1.1.0-rc.1': {}, '1.1.0': {} } }), { status: 200 }),
    ))
    const versions = await fetchStableVersions('some-pkg', undefined, PRE_RELEASE_FILTER)
    expect(versions).toEqual(['1.0.0', '1.1.0'])
  })

  it('throws on a non-ok registry response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    ))
    await expect(fetchStableVersions('missing-pkg')).rejects.toThrow('registry fetch failed')
  })

  it('throws when registry response has unexpected shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ notVersions: {} }), { status: 200 }),
    ))
    await expect(fetchStableVersions('bad-pkg')).rejects.toThrow('unexpected registry response shape')
  })

  it('excludes versions published within minimumReleaseAge days', async () => {
    const old = new Date(Date.now() - 10 * DAY_MS).toISOString()
    const recent = new Date(Date.now() - 1 * DAY_MS).toISOString()
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        versions: { '1.0.0': {}, '1.1.0': {}, '1.2.0': {} },
        time: { '1.0.0': old, '1.1.0': old, '1.2.0': recent },
      }), { status: 200 }),
    ))
    const versions = await fetchStableVersions('some-pkg', 3)
    expect(versions).toEqual(['1.0.0', '1.1.0'])
  })

  it('keeps a version published exactly at the cutoff boundary', async () => {
    const atCutoff = new Date(Date.now() - 3 * DAY_MS).toISOString()
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        versions: { '1.0.0': {} },
        time: { '1.0.0': atCutoff },
      }), { status: 200 }),
    ))
    const versions = await fetchStableVersions('some-pkg', 3)
    expect(versions).toEqual(['1.0.0'])
  })

  it('keeps all versions when minimumReleaseAge is 0', async () => {
    const recent = new Date(Date.now() - 1 * DAY_MS).toISOString()
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        versions: { '1.0.0': {}, '1.1.0': {} },
        time: { '1.0.0': recent, '1.1.0': recent },
      }), { status: 200 }),
    ))
    const versions = await fetchStableVersions('some-pkg', 0)
    expect(versions).toEqual(['1.0.0', '1.1.0'])
  })

  it('keeps a version when time entry is missing from the time map', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        versions: { '1.0.0': {} },
        time: {},
      }), { status: 200 }),
    ))
    const versions = await fetchStableVersions('some-pkg', 7)
    expect(versions).toEqual(['1.0.0'])
  })
})

// ─── resolvePackage ───────────────────────────────────────────────────────────

describe('resolvePackage', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns sorted versions, latest, and lag target', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ versions: { '1.2.0': {}, '1.0.0': {}, '1.1.0': {} } }), { status: 200 }),
    ))
    const result = await resolvePackage({ name: 'pkg', lag: 1 })
    expect(result.latest).toBe('1.2.0')
    expect(result.target).toBe('1.1.0')
    expect(result.stableVersions).toEqual(['1.0.0', '1.1.0', '1.2.0'])
  })

  it('propagates fetch errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('', { status: 404, statusText: 'Not Found' }),
    ))
    await expect(resolvePackage({ name: 'missing', lag: 1 })).rejects.toThrow('registry fetch failed')
  })
})
