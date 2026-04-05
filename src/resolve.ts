import type { ResolvedPackage } from './types.js';
import { semverCompare } from './semver.js';

const REGISTRY = 'https://registry.npmjs.org';
const DAY_MS = 86_400_000;

/** Shape of the subset of the npm registry packument we care about. */
interface Packument {
  versions: Record<string, unknown>;
  time: Record<string, string>;
}

function isPackument(value: unknown): value is Packument {
  return (
    typeof value === 'object' &&
    value !== null &&
    'versions' in value &&
    typeof (value as Record<string, unknown>)['versions'] === 'object'
  );
}

/**
 * Fetch all published versions for a package from the npm registry.
 * Returns them in publish order (oldest → newest), stable only.
 * When minimumReleaseAge is set (days), versions published more recently are excluded.
 */
export async function fetchStableVersions(name: string, minimumReleaseAge?: number, preReleaseFilter: string[] = []): Promise<string[]> {
  const res = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new Error(`registry fetch failed for "${name}": ${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  if (!isPackument(data)) {
    throw new Error(`unexpected registry response shape for "${name}"`);
  }
  const stable = Object.keys(data.versions).filter((v) => !preReleaseFilter.some((tag) => v.includes(tag)));
  if (minimumReleaseAge === undefined || minimumReleaseAge <= 0) return stable;
  const cutoff = Date.now() - minimumReleaseAge * DAY_MS;
  return stable.filter((v) => {
    const published = data.time?.[v];
    if (published === undefined) return true;
    return new Date(published).getTime() <= cutoff;
  });
}

/**
 * Given a list of stable versions (oldest → newest) and a lag value,
 * return the target version to pin to.
 *
 * If the package has fewer releases than the lag, pins to the oldest.
 */
export function computeTarget({ versions, lag }: { versions: string[]; lag: number }): string | null {
  if (versions.length === 0) return null;
  const idx = versions.length - 1 - lag;
  const version = versions[Math.max(0, idx)];
  return version ?? null;
}

/** Resolve lag target for a single package. */
export async function resolvePackage({ name, lag, minimumReleaseAge, preReleaseFilter = [] }: { name: string; lag: number; minimumReleaseAge?: number; preReleaseFilter?: string[] }): Promise<ResolvedPackage> {
  const stableVersions = (await fetchStableVersions(name, minimumReleaseAge, preReleaseFilter)).sort((versionA, versionB) => semverCompare({ versionA, versionB }));
  const latest = stableVersions.at(-1) ?? null;
  const target = computeTarget({ versions: stableVersions, lag });
  return { name, stableVersions, latest, target };
}
