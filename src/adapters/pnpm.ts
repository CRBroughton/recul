import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseYAML } from 'confbox';
import type { InstalledVersionMap } from '../types.js';
import type { LockfileAdapter } from '../lockfile.js';


interface PnpmLockEntry { version?: string; }
interface PnpmLock {
  importers?: Record<string, {
    dependencies?: Record<string, PnpmLockEntry>;
    devDependencies?: Record<string, PnpmLockEntry>;
  }>;
}

interface PnpmWorkspace {
  catalogs?: Record<string, Record<string, string>>;
}

/**
 * Parse a pnpm-lock.yaml (v6–v9) into an installed version map.
 *
 * Reads only the root importer (`.`) from the `importers` block.
 * Peer-dependency suffixes like `1.2.3(@types/node@22.0.0)` are stripped
 * to leave only the bare version number.
 */
export function parsePnpmLock(content: string): InstalledVersionMap {
  const raw = parseYAML<PnpmLock>(content);
  const result: InstalledVersionMap = {};
  const root = raw?.importers?.['.'];
  if (!root) return result;

  for (const block of [root.dependencies, root.devDependencies]) {
    if (!block) continue;
    for (const [name, entry] of Object.entries(block)) {
      if (entry.version !== undefined) {
        result[name] = entry.version.split('(')[0]!.trim();
      }
    }
  }

  return result;
}

export const pnpmAdapter: LockfileAdapter = {
  filename: 'pnpm-lock.yaml',
  parse: parsePnpmLock,
};

// ─── Workspace catalog support ────────────────────────────────────────────────────────

/**
 * Read all catalogs from pnpm-workspace.yaml and return a
 * catalogName → (packageName → specifier) map.
 *
 * `catalog:` references use the `"default"` key.
 * Named references like `catalog:testing` use the catalog name as key.
 *
 * Returns null if the file is absent or has no catalogs section.
 */
export function loadPnpmCatalog(dir: string): Record<string, Record<string, string>> | null {
  const path = resolve(dir, 'pnpm-workspace.yaml');
  if (!existsSync(path)) return null;
  try {
    const raw = parseYAML<PnpmWorkspace>(readFileSync(path, 'utf8'));
    if (!raw?.catalogs) return null;
    const result: Record<string, Record<string, string>> = {};
    for (const [catalogName, section] of Object.entries(raw.catalogs)) {
      result[catalogName] = { ...section };
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`error: could not parse ${path}: ${message}`);
    return null;
  }
}

/**
 * Substitute `catalog:` and `catalog:<name>` references in a deps map with
 * the real specifier from the workspace catalogs.
 * Entries not found in the catalog are left as-is.
 */
export function resolveCatalogRefs(
  deps: Record<string, string>,
  catalogs: Record<string, Record<string, string>>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, ver] of Object.entries(deps)) {
    if (ver === 'catalog:') {
      result[name] = catalogs['default']?.[name] ?? ver;
    } else if (ver.startsWith('catalog:')) {
      const catalogName = ver.slice('catalog:'.length);
      result[name] = catalogs[catalogName]?.[name] ?? ver;
    } else {
      result[name] = ver;
    }
  }
  return result;
}

/**
 * Update catalog entries in pnpm-workspace.yaml in place.
 * `updates` is a map of package name → new specifier (e.g. `"1.2.3"`).
 * Only lines within the file that match a catalog entry for the given name are rewritten.
 */
export function updatePnpmCatalog(dir: string, updates: Record<string, string>): void {
  const path = resolve(dir, 'pnpm-workspace.yaml');
  let content = readFileSync(path, 'utf8');
  for (const [name, version] of Object.entries(updates)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^(\\s+(?:'${escaped}'|"${escaped}"|${escaped}):\\s*)(.+)$`, 'gm');
    content = content.replace(pattern, `$1${version}`);
  }
  writeFileSync(path, content, 'utf8');
}
