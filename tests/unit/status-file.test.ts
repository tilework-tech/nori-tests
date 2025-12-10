import { describe, it, expect } from 'vitest';
import { parseStatusFile } from '../../src/utils/status-file.js';

describe('parseStatusFile', () => {
  it('correctly parses success status', () => {
    const content = JSON.stringify({ status: 'success' });

    const result = parseStatusFile(content);

    expect(result.status).toBe('success');
    expect(result.error).toBeUndefined();
  });

  it('correctly parses failure status with error message', () => {
    const content = JSON.stringify({
      status: 'failure',
      error: 'Something went wrong',
    });

    const result = parseStatusFile(content);

    expect(result.status).toBe('failure');
    expect(result.error).toBe('Something went wrong');
  });

  it('correctly parses failure status without error message', () => {
    const content = JSON.stringify({ status: 'failure' });

    const result = parseStatusFile(content);

    expect(result.status).toBe('failure');
  });

  it('throws on invalid JSON', () => {
    const content = 'not valid json {';

    expect(() => parseStatusFile(content)).toThrow();
  });

  it('throws on missing status field', () => {
    const content = JSON.stringify({ error: 'no status' });

    expect(() => parseStatusFile(content)).toThrow(/status/i);
  });

  it('throws on invalid status value', () => {
    const content = JSON.stringify({ status: 'unknown' });

    expect(() => parseStatusFile(content)).toThrow(/status/i);
  });

  it('handles extra whitespace in JSON', () => {
    const content = '  { "status": "success" }  ';

    const result = parseStatusFile(content);

    expect(result.status).toBe('success');
  });
});
