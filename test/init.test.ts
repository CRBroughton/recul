import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runInit } from '../src/init.js'

describe('runInit', () => {
  let dir: string
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'recul-init-test-'))
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    rmSync(dir, { recursive: true })
    vi.restoreAllMocks()
  })

  it('creates recul.config.jsonc when it does not exist', () => {
    runInit(dir)
    expect(existsSync(join(dir, 'recul.config.jsonc'))).toBe(true)
  })

  it('written file contains valid JSONC with default lag value', () => {
    runInit(dir)
    const content = readFileSync(join(dir, 'recul.config.jsonc'), 'utf8')
    expect(content).toContain('"lag": 2')
  })

  it('exits with code 1 when config file already exists', () => {
    writeFileSync(join(dir, 'recul.config.jsonc'), '{}')
    runInit(dir)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
