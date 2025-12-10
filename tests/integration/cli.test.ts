import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CLI', () => {
  let tempDir: string;
  const cliPath = path.resolve(__dirname, '../../dist/index.js');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('accepts a folder path as argument', () => {
    fs.writeFileSync(path.join(tempDir, 'test.md'), '# Test');

    // This should not throw
    const result = execSync(`node ${cliPath} ${tempDir} --dry-run`, {
      encoding: 'utf-8',
      env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
    });

    expect(result).toBeDefined();
  });

  it('exits with error if folder does not exist', () => {
    const nonExistent = path.join(tempDir, 'does-not-exist');

    expect(() => {
      execSync(`node ${cliPath} ${nonExistent}`, { encoding: 'utf-8' });
    }).toThrow();
  });

  it('shows help with --help flag', () => {
    const result = execSync(`node ${cliPath} --help`, { encoding: 'utf-8' });

    expect(result).toContain('nori-tests');
    expect(result).toContain('folder');
  });

  it('shows version with --version flag', () => {
    const result = execSync(`node ${cliPath} --version`, {
      encoding: 'utf-8',
    });

    expect(result).toMatch(/\d+\.\d+\.\d+/);
  });

  it('outputs JSON report when --output flag is specified', () => {
    fs.writeFileSync(path.join(tempDir, 'test.md'), '# Test');
    const outputFile = path.join(tempDir, 'report.json');

    execSync(`node ${cliPath} ${tempDir} --output ${outputFile} --dry-run`, {
      encoding: 'utf-8',
      env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
    });

    expect(fs.existsSync(outputFile)).toBe(true);
    const report = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    expect(report).toHaveProperty('totalTests');
    expect(report).toHaveProperty('results');
  });

  it('supports --keep-containers flag', () => {
    const result = execSync(`node ${cliPath} --help`, { encoding: 'utf-8' });

    expect(result).toContain('keep-containers');
  });

  it('reports no tests found for empty directory', () => {
    const result = execSync(`node ${cliPath} ${tempDir} --dry-run`, {
      encoding: 'utf-8',
      env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
    });

    expect(result).toContain('0');
  });

  it('prompts for API key if not set', () => {
    // Remove API key from environment
    const envWithoutKey = { ...process.env };
    delete envWithoutKey.ANTHROPIC_API_KEY;

    expect(() => {
      execSync(`node ${cliPath} ${tempDir}`, {
        encoding: 'utf-8',
        env: envWithoutKey,
        timeout: 5000,
      });
    }).toThrow();
  });
});
