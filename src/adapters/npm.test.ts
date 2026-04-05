import { describe, it, expect } from 'vitest';
import { parsePackagesBlock, parseNpmLock } from './npm.js';

describe('parsePackagesBlock', () => {
  it('extracts top-level package names and versions', () => {
    const result = parsePackagesBlock({
      'node_modules/express': { version: '5.2.0' },
      'node_modules/lodash': { version: '4.17.21' },
    });
    expect(result['express']).toBe('5.2.0');
    expect(result['lodash']).toBe('4.17.21');
  });

  it('extracts scoped package names', () => {
    const result = parsePackagesBlock({ 'node_modules/@types/node': { version: '22.0.0' } });
    expect(result['@types/node']).toBe('22.0.0');
  });

  it('skips entries without a node_modules/ prefix', () => {
    const result = parsePackagesBlock({ '': { version: '1.0.0' } });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('skips nested installs (foo/node_modules/bar)', () => {
    const result = parsePackagesBlock({
      'node_modules/foo/node_modules/bar': { version: '2.0.0' },
      'node_modules/bar': { version: '3.0.0' },
    });
    expect(result['bar']).toBe('3.0.0');
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('skips entries with no version field', () => {
    const result = parsePackagesBlock({ 'node_modules/pkg': {} });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('returns empty map for empty input', () => {
    expect(parsePackagesBlock({})).toEqual({});
  });
});

describe('parseNpmLock', () => {
  const fixture = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'my-app', version: '1.0.0' },
      'node_modules/express': { version: '5.2.0' },
      'node_modules/@types/node': { version: '22.0.0' },
    },
  });

  it('reads from the packages block', () => {
    expect(parseNpmLock(fixture)['express']).toBe('5.2.0');
  });

  it('handles scoped packages', () => {
    expect(parseNpmLock(fixture)['@types/node']).toBe('22.0.0');
  });

  it('excludes the root entry', () => {
    expect(parseNpmLock(fixture)['']).toBeUndefined();
  });

  it('returns empty map when packages block is absent', () => {
    expect(parseNpmLock(JSON.stringify({ lockfileVersion: 3 }))).toEqual({});
  });

  it('returns empty map for invalid JSON', () => {
    expect(parseNpmLock('not json')).toEqual({});
  });

  it('returns empty map for null root', () => {
    expect(parseNpmLock(JSON.stringify(null))).toEqual({});
  });
});
