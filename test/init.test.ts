import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/init.js';

describe('runInit', () => {
  let dir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lag-behind-init-test-'));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
    vi.restoreAllMocks();
  });

  it('creates lag-behind.config.jsonc when it does not exist', () => {
    runInit(dir);
    expect(existsSync(join(dir, 'lag-behind.config.jsonc'))).toBe(true);
  });

  it('written file contains valid JSONC with default lag value', () => {
    runInit(dir);
    const content = readFileSync(join(dir, 'lag-behind.config.jsonc'), 'utf8');
    expect(content).toContain('"lag": 2');
  });

  it('exits with code 1 when config file already exists', () => {
    writeFileSync(join(dir, 'lag-behind.config.jsonc'), '{}');
    runInit(dir);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
