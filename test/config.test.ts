import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveRangeSpecifier,
  rangePrefix,
  loadConfigFile,
  resolveConfigDir,
} from '../src/config.js';
import type { RangeSpecifier } from '../src/types.js';

// ─── resolveRangeSpecifier ────────────────────────────────────────────────────

describe('resolveRangeSpecifier', () => {
  it('returns the string directly when config is a plain specifier', () => {
    expect(resolveRangeSpecifier({ config: 'caret', name: 'react' })).toBe('caret');
  });

  it('returns the per-package specifier when the name is in the map', () => {
    expect(resolveRangeSpecifier({ config: { default: 'exact', react: 'tilde' }, name: 'react' })).toBe('tilde');
  });

  it('falls back to "default" key when name is not in the map', () => {
    expect(resolveRangeSpecifier({ config: { default: 'caret', react: 'tilde' }, name: 'lodash' })).toBe('caret');
  });

  it('falls back to "exact" when neither name nor default is present', () => {
    expect(resolveRangeSpecifier({ config: { react: 'tilde' }, name: 'lodash' })).toBe('exact');
  });

  it('ignores an invalid value in the map and falls back to "exact"', () => {
    expect(resolveRangeSpecifier({ config: { react: 'banana' as never }, name: 'react' })).toBe('exact');
  });
});

// ─── loadConfigFile ───────────────────────────────────────────────────────────

describe('loadConfigFile', () => {
  let dir: string;

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lag-behind-test-')); });
  afterEach(() => { rmSync(dir, { recursive: true }); });

  it('returns null when no config file exists', () => {
    expect(loadConfigFile(dir)).toBeNull();
  });

  it('reads a .jsonc file and returns parsed fields', () => {
    writeFileSync(join(dir, 'lag-behind.config.jsonc'), JSON.stringify({ lag: 5, packageManager: 'pnpm' }));
    const cfg = loadConfigFile(dir);
    expect(cfg).not.toBeNull();
    expect((cfg as Record<string, unknown>)['lag']).toBe(5);
  });

  it('strips JSONC comments', () => {
    writeFileSync(join(dir, 'lag-behind.config.jsonc'), '{ // comment\n"lag": 4 }');
    const cfg = loadConfigFile(dir);
    expect((cfg as Record<string, unknown>)['lag']).toBe(4);
  });

  it('returns {} for invalid JSON', () => {
    writeFileSync(join(dir, 'lag-behind.config.jsonc'), 'not json!!!');
    expect(loadConfigFile(dir)).toEqual({});
  });

  it('returns {} when root is not an object', () => {
    writeFileSync(join(dir, 'lag-behind.config.jsonc'), '"just a string"');
    expect(loadConfigFile(dir)).toEqual({});
  });
});

// ─── resolveConfigDir ─────────────────────────────────────────────────────────

describe('resolveConfigDir', () => {
  it('returns cwd when no file is specified', () => {
    expect(resolveConfigDir({ cwd: '/some/project' })).toBe('/some/project');
  });

  it('returns the directory of the file when file is specified', () => {
    expect(resolveConfigDir({ file: 'packages/app/package.json', cwd: '/repo' }))
      .toBe('/repo/packages/app');
  });

  it('returns cwd when file is just a filename with no directory component', () => {
    expect(resolveConfigDir({ file: 'package.json', cwd: '/repo' })).toBe('/repo');
  });
});

// ─── rangePrefix ─────────────────────────────────────────────────────────────

describe('rangePrefix', () => {
  const cases: Array<[RangeSpecifier, string]> = [
    ['exact', ''],
    ['caret', '^'],
    ['tilde', '~'],
  ];
  for (const [specifier, expected] of cases) {
    it(`returns "${expected}" for "${specifier}"`, () => {
      expect(rangePrefix(specifier)).toBe(expected);
    });
  }
});
