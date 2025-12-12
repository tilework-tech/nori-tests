import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type AuthMethod =
  | { type: 'api-key'; apiKey: string; hasBoth?: boolean }
  | { type: 'session'; sessionFile: string; hasBoth?: boolean }
  | { type: 'none' };

export interface AuthConfig {
  env: Record<string, string>;
  sessionFileToCopy: string | null;
}

/**
 * Find the Claude credentials file (.credentials.json) in standard locations.
 * Checks ~/.claude/.credentials.json first, then ./.credentials.json
 * @returns Path to credentials file if found, null otherwise
 */
export function findClaudeSessionFile(): string | null {
  // Check global location first: ~/.claude/.credentials.json
  const home = os.homedir();
  if (home) {
    const globalSession = path.join(home, '.claude', '.credentials.json');
    if (fs.existsSync(globalSession)) {
      return globalSession;
    }
  }

  // Check local location: ./.credentials.json
  const localSession = path.join(process.cwd(), '.credentials.json');
  if (fs.existsSync(localSession)) {
    return localSession;
  }

  return null;
}

/**
 * Get the authentication method based on available sources.
 * By default, API key takes precedence over session file.
 * @param preferSession If true, prefer session file over API key
 * @returns Authentication method details
 */
export function getAuthMethod(preferSession = false): AuthMethod {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const sessionFile = findClaudeSessionFile();

  const hasBoth = !!apiKey && !!sessionFile;

  // If preferSession is true, check session first
  if (preferSession) {
    if (sessionFile) {
      return { type: 'session', sessionFile, hasBoth };
    }
    if (apiKey) {
      return { type: 'api-key', apiKey, hasBoth };
    }
  } else {
    // Default: API key takes precedence
    if (apiKey) {
      return { type: 'api-key', apiKey, hasBoth };
    }
    if (sessionFile) {
      return { type: 'session', sessionFile, hasBoth };
    }
  }

  return { type: 'none' };
}

/**
 * Get authentication configuration for container execution.
 * @param authMethod The authentication method to use
 * @returns Configuration with environment variables and session file to copy
 */
export function getAuthConfig(authMethod: AuthMethod): AuthConfig {
  if (authMethod.type === 'api-key') {
    return {
      env: { ANTHROPIC_API_KEY: authMethod.apiKey },
      sessionFileToCopy: null,
    };
  }

  if (authMethod.type === 'session') {
    return {
      env: {},
      sessionFileToCopy: authMethod.sessionFile,
    };
  }

  throw new Error('No authentication method available');
}
