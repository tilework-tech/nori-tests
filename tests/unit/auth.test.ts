import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  findClaudeSessionFile,
  getAuthMethod,
  getAuthConfig,
} from '../../src/utils/auth.js';

describe('findClaudeSessionFile', () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    // Create temp directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-auth-test-'));
    originalHome = process.env.HOME;
    // Set HOME to temp directory for testing
    process.env.HOME = tempDir;
  });

  afterEach(() => {
    // Restore original HOME
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should find .claude.json in ~/.claude/ directory when it exists', () => {
    // Create ~/.claude/.claude.json
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const sessionFile = path.join(claudeDir, '.claude.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ test: 'data' }));

    const result = findClaudeSessionFile();

    expect(result).toBe(sessionFile);
  });

  it('should return null when no session file exists', () => {
    const result = findClaudeSessionFile();

    expect(result).toBeNull();
  });

  it('should find .claude.json in current working directory when it exists', () => {
    // Create .claude.json in current directory
    const cwd = process.cwd();
    const sessionFile = path.join(cwd, '.claude.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ test: 'local' }));

    try {
      const result = findClaudeSessionFile();

      expect(result).toBe(sessionFile);
    } finally {
      // Clean up
      if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile);
      }
    }
  });

  it('should prefer ~/.claude/.claude.json over local .claude.json', () => {
    // Create both files
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const globalSession = path.join(claudeDir, '.claude.json');
    fs.writeFileSync(globalSession, JSON.stringify({ test: 'global' }));

    const cwd = process.cwd();
    const localSession = path.join(cwd, '.claude.json');
    fs.writeFileSync(localSession, JSON.stringify({ test: 'local' }));

    try {
      const result = findClaudeSessionFile();

      // Should prefer global
      expect(result).toBe(globalSession);
    } finally {
      // Clean up
      if (fs.existsSync(localSession)) {
        fs.unlinkSync(localSession);
      }
    }
  });
});

describe('getAuthMethod', () => {
  let tempDir: string;
  let originalHome: string | undefined;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-auth-test-'));
    originalHome = process.env.HOME;
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.HOME = tempDir;
    // Clear API key for clean test environment
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return api-key method when only API key exists', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key-12345';

    const result = getAuthMethod();

    expect(result.type).toBe('api-key');
    if (result.type === 'api-key') {
      expect(result.apiKey).toBe('sk-test-key-12345');
    }
  });

  it('should return session method when only session file exists', () => {
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const sessionFile = path.join(claudeDir, '.claude.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ test: 'data' }));

    const result = getAuthMethod();

    expect(result.type).toBe('session');
    if (result.type === 'session') {
      expect(result.sessionFile).toBe(sessionFile);
    }
  });

  it('should return api-key method when both exist (default priority)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key-12345';
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const sessionFile = path.join(claudeDir, '.claude.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ test: 'data' }));

    const result = getAuthMethod();

    expect(result.type).toBe('api-key');
    if (result.type === 'api-key') {
      expect(result.apiKey).toBe('sk-test-key-12345');
    }
  });

  it('should return session method when both exist and preferSession is true', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key-12345';
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const sessionFile = path.join(claudeDir, '.claude.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ test: 'data' }));

    const result = getAuthMethod(true);

    expect(result.type).toBe('session');
    if (result.type === 'session') {
      expect(result.sessionFile).toBe(sessionFile);
    }
  });

  it('should return none when no auth is available', () => {
    const result = getAuthMethod();

    expect(result.type).toBe('none');
  });

  it('should detect both auth sources when they exist', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key-12345';
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const sessionFile = path.join(claudeDir, '.claude.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ test: 'data' }));

    const result = getAuthMethod();

    expect(result.type).toBe('api-key');
    expect(result.hasBoth).toBe(true);
  });
});

describe('getAuthConfig', () => {
  let tempDir: string;
  let originalHome: string | undefined;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-auth-test-'));
    originalHome = process.env.HOME;
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.HOME = tempDir;
    // Clear API key for clean test environment
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return API key config when using api-key auth', () => {
    const authMethod = {
      type: 'api-key' as const,
      apiKey: 'sk-test-key-12345',
    };

    const config = getAuthConfig(authMethod);

    expect(config.env.ANTHROPIC_API_KEY).toBe('sk-test-key-12345');
    expect(config.sessionFileToCopy).toBeNull();
  });

  it('should return session config when using session auth', () => {
    const sessionFile = path.join(tempDir, '.claude', '.claude.json');
    const authMethod = { type: 'session' as const, sessionFile };

    const config = getAuthConfig(authMethod);

    expect(config.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(config.sessionFileToCopy).toBe(sessionFile);
  });

  it('should throw error when no auth is available', () => {
    const authMethod = { type: 'none' as const };
    expect(() => getAuthConfig(authMethod)).toThrow(
      'No authentication method available',
    );
  });

  it('should use session when authMethod is session', () => {
    const sessionFile = path.join(tempDir, '.claude', '.claude.json');
    const authMethod = {
      type: 'session' as const,
      sessionFile,
      hasBoth: true,
    };

    const config = getAuthConfig(authMethod);

    expect(config.sessionFileToCopy).toBe(sessionFile);
    expect(config.env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
