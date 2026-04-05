import type { DeclaredSpecifier, RangeSpecifier } from './types.js';

/** Strip leading range characters (^, ~, >=, etc.) to get a bare version. */
export function bareVersion(version: string): string {
  return version.replace(/^[^0-9]*/, '');
}

/**
 * Compare two bare semver strings.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
interface SemverCompareOptions { versionA: string; versionB: string; }

export function semverCompare({ versionA, versionB }: SemverCompareOptions): number {
  const partsA = versionA.split('.').map(Number);
  const partsB = versionB.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Compare two bare semver strings with awareness of the configured specifier.
 *
 * - exact  → compare all three components (major.minor.patch)
 * - tilde  → compare major.minor only   (patch drift is acceptable)
 * - caret  → compare major only         (minor + patch drift is acceptable)
 */
interface SemverCompareForSpecifierOptions { versionA: string; versionB: string; specifier: RangeSpecifier; }

export function semverCompareForSpecifier({ versionA, versionB, specifier }: SemverCompareForSpecifierOptions): number {
  const partsA = versionA.split('.').map(Number);
  const partsB = versionB.split('.').map(Number);
  const depthBySpecifier: Record<RangeSpecifier, number> = { exact: 3, tilde: 2, caret: 1 };
  const depth = depthBySpecifier[specifier];
  for (let i = 0; i < depth; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Detect the range specifier prefix declared in a raw version string. */
export function detectSpecifier(raw: string): DeclaredSpecifier {
  if (raw.startsWith('^')) return 'caret';
  if (raw.startsWith('~')) return 'tilde';
  if (/^[0-9]/.test(raw)) return 'exact';
  return 'other';
}
