import { describe, it, expect } from 'vitest';
import { bareVersion, semverCompare, semverCompareForSpecifier, detectSpecifier } from '../src/semver.js';

describe('bareVersion', () => {
  it('strips caret', () => expect(bareVersion('^1.2.3')).toBe('1.2.3'));
  it('strips tilde', () => expect(bareVersion('~1.2.3')).toBe('1.2.3'));
  it('strips >= prefix', () => expect(bareVersion('>=1.2.3')).toBe('1.2.3'));
  it('leaves bare version unchanged', () => expect(bareVersion('1.2.3')).toBe('1.2.3'));
  it('leaves empty string unchanged', () => expect(bareVersion('')).toBe(''));
});

describe('semverCompare', () => {
  it('equal versions return 0', () => expect(semverCompare({ versionA: '1.2.3', versionB: '1.2.3' })).toBe(0));
  it('patch lower returns negative', () => expect(semverCompare({ versionA: '1.2.2', versionB: '1.2.3' })).toBeLessThan(0));
  it('patch higher returns positive', () => expect(semverCompare({ versionA: '1.2.4', versionB: '1.2.3' })).toBeGreaterThan(0));
  it('minor lower returns negative', () => expect(semverCompare({ versionA: '1.1.9', versionB: '1.2.0' })).toBeLessThan(0));
  it('minor higher returns positive', () => expect(semverCompare({ versionA: '1.3.0', versionB: '1.2.9' })).toBeGreaterThan(0));
  it('major lower returns negative', () => expect(semverCompare({ versionA: '0.9.9', versionB: '1.0.0' })).toBeLessThan(0));
  it('major higher returns positive', () => expect(semverCompare({ versionA: '2.0.0', versionB: '1.9.9' })).toBeGreaterThan(0));
  it('missing patch component treated as 0', () => expect(semverCompare({ versionA: '1.2', versionB: '1.2.0' })).toBe(0));
});

describe('semverCompareForSpecifier', () => {
  it('exact — compares all three components', () => {
    expect(semverCompareForSpecifier({ versionA: '4.1.2', versionB: '4.1.0', specifier: 'exact' })).toBeGreaterThan(0);
    expect(semverCompareForSpecifier({ versionA: '4.1.0', versionB: '4.1.0', specifier: 'exact' })).toBe(0);
  });

  it('tilde — ignores patch, compares major.minor', () => {
    expect(semverCompareForSpecifier({ versionA: '4.1.2', versionB: '4.1.0', specifier: 'tilde' })).toBe(0);
    expect(semverCompareForSpecifier({ versionA: '4.2.0', versionB: '4.1.0', specifier: 'tilde' })).toBeGreaterThan(0);
    expect(semverCompareForSpecifier({ versionA: '4.0.9', versionB: '4.1.0', specifier: 'tilde' })).toBeLessThan(0);
  });

  it('caret — ignores minor and patch, compares major only', () => {
    expect(semverCompareForSpecifier({ versionA: '4.9.9', versionB: '4.0.0', specifier: 'caret' })).toBe(0);
    expect(semverCompareForSpecifier({ versionA: '5.0.0', versionB: '4.0.0', specifier: 'caret' })).toBeGreaterThan(0);
    expect(semverCompareForSpecifier({ versionA: '3.9.9', versionB: '4.0.0', specifier: 'caret' })).toBeLessThan(0);
  });
});

describe('detectSpecifier', () => {
  it('detects caret', () => expect(detectSpecifier('^1.2.3')).toBe('caret'));
  it('detects tilde', () => expect(detectSpecifier('~1.2.3')).toBe('tilde'));
  it('detects exact', () => expect(detectSpecifier('1.2.3')).toBe('exact'));
  it('returns other for >= prefix', () => expect(detectSpecifier('>=1.2.3')).toBe('other'));
  it('returns other for workspace protocol', () => expect(detectSpecifier('workspace:*')).toBe('other'));
});
