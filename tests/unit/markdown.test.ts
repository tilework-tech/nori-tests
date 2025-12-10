import { describe, it, expect } from 'vitest';
import { appendStatusInstructions } from '../../src/utils/markdown.js';

describe('appendStatusInstructions', () => {
  it('appends status file instructions to markdown content', () => {
    const markdown = '# My Test\n\nDo something useful.';
    const statusFilePath = '/workspace/.nori-test-status.json';

    const result = appendStatusInstructions(markdown, statusFilePath);

    expect(result).toContain(markdown);
    expect(result).toContain(statusFilePath);
    expect(result).toContain('status');
  });

  it('includes the required JSON format in instructions', () => {
    const markdown = '# Test';
    const statusFilePath = '/workspace/.nori-test-status.json';

    const result = appendStatusInstructions(markdown, statusFilePath);

    expect(result).toContain('success');
    expect(result).toContain('failure');
    expect(result).toContain('error');
  });

  it('preserves original markdown content at the beginning', () => {
    const markdown = '# Original Content\n\nThis should stay intact.';
    const statusFilePath = '/workspace/.nori-test-status.json';

    const result = appendStatusInstructions(markdown, statusFilePath);

    expect(result.startsWith(markdown)).toBe(true);
  });

  it('handles empty markdown gracefully', () => {
    const markdown = '';
    const statusFilePath = '/workspace/.nori-test-status.json';

    const result = appendStatusInstructions(markdown, statusFilePath);

    expect(result).toContain(statusFilePath);
    expect(result.length).toBeGreaterThan(0);
  });
});
