import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { discoverTests } from '../../src/utils/test-discovery.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('discoverTests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-tests-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds all .md files in a directory', () => {
    fs.writeFileSync(path.join(tempDir, 'test1.md'), '# Test 1');
    fs.writeFileSync(path.join(tempDir, 'test2.md'), '# Test 2');

    const tests = discoverTests(tempDir);

    expect(tests).toHaveLength(2);
    expect(tests.some((t) => t.endsWith('test1.md'))).toBe(true);
    expect(tests.some((t) => t.endsWith('test2.md'))).toBe(true);
  });

  it('ignores non-md files', () => {
    fs.writeFileSync(path.join(tempDir, 'test.md'), '# Test');
    fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'Not a test');
    fs.writeFileSync(path.join(tempDir, 'script.js'), 'console.log()');

    const tests = discoverTests(tempDir);

    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatch(/test\.md$/);
  });

  it('returns absolute paths', () => {
    fs.writeFileSync(path.join(tempDir, 'test.md'), '# Test');

    const tests = discoverTests(tempDir);

    expect(tests).toHaveLength(1);
    expect(path.isAbsolute(tests[0])).toBe(true);
  });

  it('throws if directory does not exist', () => {
    const nonExistentDir = path.join(tempDir, 'does-not-exist');

    expect(() => discoverTests(nonExistentDir)).toThrow();
  });

  it('returns empty array for directory with no md files', () => {
    fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'No tests here');

    const tests = discoverTests(tempDir);

    expect(tests).toHaveLength(0);
  });

  it('does not recurse into subdirectories', () => {
    fs.writeFileSync(path.join(tempDir, 'test.md'), '# Test');
    const subDir = path.join(tempDir, 'subdir');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'nested.md'), '# Nested');

    const tests = discoverTests(tempDir);

    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatch(/test\.md$/);
  });
});
