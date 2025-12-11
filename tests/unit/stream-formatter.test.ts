import { describe, it, expect } from 'vitest';
import { StreamFormatter } from '../../src/utils/stream-formatter.js';

describe('StreamFormatter', () => {
  describe('line buffering', () => {
    it('buffers partial lines until newline received', () => {
      const formatter = new StreamFormatter();

      // First chunk is partial (no newline) - use assistant message that will produce output
      const result1 = formatter.processChunk(
        '{"type":"assistant","message":{"content":[{"type":"text","text":"He',
      );
      expect(result1).toEqual([]);

      // Second chunk completes the line
      const result2 = formatter.processChunk('llo"}]}}\n');
      expect(result2.length).toBeGreaterThan(0);
      expect(result2[0]).toContain('Hello');
    });

    it('handles multiple complete lines in one chunk', () => {
      const formatter = new StreamFormatter();

      const chunk =
        '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}\n' +
        '{"type":"assistant","message":{"content":[{"type":"text","text":"World"}]}}\n';

      const results = formatter.processChunk(chunk);
      expect(results.length).toBe(2);
    });

    it('handles empty chunks', () => {
      const formatter = new StreamFormatter();
      const results = formatter.processChunk('');
      expect(results).toEqual([]);
    });

    it('handles chunk with only newlines', () => {
      const formatter = new StreamFormatter();
      const results = formatter.processChunk('\n\n\n');
      expect(results).toEqual([]);
    });
  });

  describe('system/init message formatting', () => {
    it('formats system init message with session info', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'abc123',
        tools: ['Bash', 'Read', 'Write'],
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBe(1);
      expect(results[0]).toContain('Session');
      expect(results[0]).toContain('abc123');
    });
  });

  describe('assistant text formatting', () => {
    it('formats assistant text content', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'I will help you with that.' }],
        },
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBe(1);
      expect(results[0]).toContain('I will help you with that.');
    });

    it('handles multiple text blocks in one message', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'First part.' },
            { type: 'text', text: 'Second part.' },
          ],
        },
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBe(1);
      expect(results[0]).toContain('First part.');
      expect(results[0]).toContain('Second part.');
    });
  });

  describe('tool_use formatting', () => {
    it('formats tool_use with tool name and truncated input', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'Bash',
              input: {
                command: 'npm test',
                description: 'Run the test suite',
              },
            },
          ],
        },
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBe(1);
      expect(results[0]).toContain('Bash');
      expect(results[0]).toMatch(/npm test|Run the test suite/);
    });

    it('truncates long tool inputs', () => {
      const formatter = new StreamFormatter();

      const longCommand = 'a'.repeat(200);
      const message = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'Bash',
              input: { command: longCommand },
            },
          ],
        },
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBe(1);
      // Should be truncated, not full 200 chars
      expect(results[0].length).toBeLessThan(250);
      expect(results[0]).toContain('...');
    });

    it('formats Read tool showing file path', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'Read',
              input: { file_path: '/home/user/project/src/index.ts' },
            },
          ],
        },
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBe(1);
      expect(results[0]).toContain('Read');
      expect(results[0]).toContain('index.ts');
    });

    it('formats Write tool showing file path', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'Write',
              input: {
                file_path: '/home/user/project/new-file.ts',
                content: 'console.log("hello");',
              },
            },
          ],
        },
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBe(1);
      expect(results[0]).toContain('Write');
      expect(results[0]).toContain('new-file.ts');
    });
  });

  describe('tool_result formatting', () => {
    it('formats tool_result with truncated content', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_123',
              content:
                'Command executed successfully\nOutput line 1\nOutput line 2',
            },
          ],
        },
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBe(1);
      expect(results[0]).toContain('Result');
    });

    it('truncates very long tool results', () => {
      const formatter = new StreamFormatter();

      const longResult = 'x'.repeat(500);
      const message = JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_123',
              content: longResult,
            },
          ],
        },
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBe(1);
      // Should be truncated
      expect(results[0].length).toBeLessThan(200);
      expect(results[0]).toContain('...');
    });
  });

  describe('result message formatting', () => {
    it('formats success result with stats', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'result',
        subtype: 'success',
        total_cost_usd: 0.0035,
        duration_ms: 12500,
        num_turns: 6,
        result: 'Task completed successfully',
        session_id: 'abc123',
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBe(1);
      expect(results[0]).toMatch(/complete|success/i);
      expect(results[0]).toMatch(/\$0\.003|\$0\.00|cost/i);
    });

    it('formats error result', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'result',
        subtype: 'error',
        is_error: true,
        result: 'Something went wrong',
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBe(1);
      expect(results[0]).toMatch(/error|failed/i);
    });
  });

  describe('malformed JSON handling', () => {
    it('skips invalid JSON lines gracefully', () => {
      const formatter = new StreamFormatter();

      const results = formatter.processChunk('not valid json\n');
      expect(results).toEqual([]);
    });

    it('continues processing after invalid line', () => {
      const formatter = new StreamFormatter();

      const chunk =
        'invalid json\n' +
        '{"type":"assistant","message":{"content":[{"type":"text","text":"Valid"}]}}\n';

      const results = formatter.processChunk(chunk);
      expect(results.length).toBe(1);
      expect(results[0]).toContain('Valid');
    });
  });

  describe('unknown message types', () => {
    it('skips unknown message types', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'unknown_future_type',
        data: 'some data',
      });

      const results = formatter.processChunk(message + '\n');
      expect(results).toEqual([]);
    });

    it('skips file-history-snapshot messages', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'file-history-snapshot',
        files: ['/some/file.ts'],
      });

      const results = formatter.processChunk(message + '\n');
      expect(results).toEqual([]);
    });
  });

  describe('mixed content messages', () => {
    it('handles message with both text and tool_use', () => {
      const formatter = new StreamFormatter();

      const message = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Let me check that file.' },
            {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'Read',
              input: { file_path: '/src/index.ts' },
            },
          ],
        },
      });

      const results = formatter.processChunk(message + '\n');
      expect(results.length).toBeGreaterThanOrEqual(1);
      // Should contain both the text and the tool info
      const combined = results.join('\n');
      expect(combined).toContain('Let me check that file.');
      expect(combined).toContain('Read');
    });
  });
});
