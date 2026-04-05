import type { ResolvedPackage } from './types.js';
import { semverCompare } from './semver.js';

const REGISTRY = 'https://registry.npmjs.org';
const PRE_RELEASE = /[-+]/; // catches -alpha, -beta, -rc and build metadata

/** Shape of the subset of the npm registry packument we care about. */
interface Packument {
  versions: Record<string, unknown>;
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
 */
export async function fetchStableVersions(name: string): Promise<string[]> {
  const res = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new Error(`registry fetch failed for "${name}": ${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  if (!isPackument(data)) {
    throw new Error(`unexpected registry response shape for "${name}"`);
  }
  return Object.keys(data.versions).filter((v) => !PRE_RELEASE.test(v));
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
export async function resolvePackage({ name, lag }: { name: string; lag: number }): Promise<ResolvedPackage> {
  const stableVersions = (await fetchStableVersions(name)).sort((versionA, versionB) => semverCompare({ versionA, versionB }));
  const latest = stableVersions.at(-1) ?? null;
  const target = computeTarget({ versions: stableVersions, lag });
  return { name, stableVersions, latest, target };
}
