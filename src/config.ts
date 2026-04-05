import type { Config, ConfigFile, RangeSpecifier, RangeSpecifierConfig } from './types.js'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseJSONC } from 'confbox'

const VALID_RANGE: ReadonlySet<string> = new Set(['exact', 'caret', 'tilde'])

function isRangeSpecifier(value: string): value is RangeSpecifier {
  return VALID_RANGE.has(value)
}

const CONFIG_FILE = 'lag-behind.config.jsonc'

/**
 * Load the config file from `dir`.
 * Returns the parsed config, or null if no config file was found.
 */
export function loadConfigFile(dir: string): ConfigFile | null {
  const path = resolve(dir, CONFIG_FILE)
  if (existsSync(path)) {
    try {
      const src = readFileSync(path, 'utf8')
      const raw = parseJSONC<ConfigFile | null>(src)
      if (raw === null || typeof raw !== 'object')
        return null
      return raw
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`error: could not parse ${path}: ${message}`)
      return null
    }
  }
  return null
}

/** Resolve the directory to search for the config file, based on --file if provided. */
export function resolveConfigDir({ file, cwd }: { file?: string, cwd: string }): string {
  return file !== undefined ? resolve(cwd, dirname(file)) : cwd
}

export const DEFAULTS: Config = {
  lag: 2,
  file: 'package.json',
  pm: 'npm',
  packages: [],
  ignore: [],
  behindBehavior: 'ignore',
  rangeSpecifier: 'exact',
  preReleaseFilter: ['-alpha', '-beta', '-rc', '-next', '-canary'],
}

/**
 * Resolve the effective RangeSpecifier for a specific package.
 * When config is a string it applies to all packages.
 * When config is a record, looks up by name, then "default", then falls back to "exact".
 */
export function resolveRangeSpecifier({ config, name }: { config: RangeSpecifierConfig, name: string }): RangeSpecifier {
  if (typeof config === 'string')
    return config
  const specific = config[name]
  if (specific !== undefined && isRangeSpecifier(specific))
    return specific
  const fallback = config.default
  if (fallback !== undefined && isRangeSpecifier(fallback))
    return fallback
  return 'exact'
}

export function rangePrefix(specifier: RangeSpecifier): string {
  switch (specifier) {
    case 'caret': return '^'
    case 'tilde': return '~'
    case 'exact': return ''
  }
}
