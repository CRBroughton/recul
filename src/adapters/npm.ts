import { destr } from 'destr';
import type { InstalledVersionMap } from '../types.js';
import type { LockfileAdapter } from '../lockfile.js';

interface NpmLockPackageEntry {
  version?: string;
}

interface NpmLock {
  packages?: Record<string, NpmLockPackageEntry>;
}

export function parsePackagesBlock(packages: Record<string, NpmLockPackageEntry>): InstalledVersionMap {
  const result: InstalledVersionMap = {};
  for (const [key, entry] of Object.entries(packages)) {
    if (!key.startsWith('node_modules/')) continue;
    const name = key.slice('node_modules/'.length);
    // Skip nested installs like "foo/node_modules/bar"
    if (name.includes('node_modules')) continue;
    if (typeof entry.version === 'string') result[name] = entry.version;
  }
  return result;
}

export function parseNpmLock(content: string): InstalledVersionMap {
  const raw = destr<NpmLock | null>(content);
  if (raw === null || typeof raw !== 'object') return {};
  return raw.packages ? parsePackagesBlock(raw.packages) : {};
}

export const npmAdapter: LockfileAdapter = {
  filename: 'package-lock.json',
  parse: parseNpmLock,
};
