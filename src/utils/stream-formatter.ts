/**
 * StreamFormatter - Parses JSONL stream from claude-code and formats for human readability
 */

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | unknown;
}

interface StreamMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  tools?: string[];
  message?: {
    content?: ContentBlock[] | string;
    role?: string;
  };
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  result?: string;
  is_error?: boolean;
}

export class StreamFormatter {
  private buffer: string = '';

  processChunk(data: string): string[] {
    if (!data) return [];

    this.buffer += data;
    const lines = this.buffer.split('\n');

    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || '';

    const results: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as StreamMessage;
        const formatted = this.formatMessage(parsed);
        if (formatted) {
          results.push(formatted);
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return results;
  }

  private formatMessage(msg: StreamMessage): string | null {
    switch (msg.type) {
      case 'system':
        return this.formatSystemMessage(msg);
      case 'assistant':
        return this.formatAssistantMessage(msg);
      case 'user':
        return this.formatUserMessage(msg);
      case 'result':
        return this.formatResultMessage(msg);
      default:
        return null;
    }
  }

  private formatSystemMessage(msg: StreamMessage): string | null {
    if (msg.subtype === 'init' && msg.session_id) {
      const toolCount = msg.tools?.length || 0;
      return `${COLORS.dim}▶ Session started: ${msg.session_id} (${toolCount} tools available)${COLORS.reset}`;
    }
    return null;
  }

  private formatAssistantMessage(msg: StreamMessage): string | null {
    if (!msg.message?.content) return null;

    const content = msg.message.content;
    if (typeof content === 'string') {
      return `${COLORS.cyan}Claude:${COLORS.reset} ${content}`;
    }

    if (!Array.isArray(content)) return null;

    const parts: string[] = [];

    for (const block of content) {
      if (block.type === 'text' && block.text) {
        parts.push(`${COLORS.cyan}Claude:${COLORS.reset} ${block.text}`);
      } else if (block.type === 'tool_use' && block.name) {
        const toolDesc = this.formatToolUse(block);
        parts.push(
          `${COLORS.yellow}🔧 ${block.name}:${COLORS.reset} ${toolDesc}`,
        );
      }
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }

  private formatToolUse(block: ContentBlock): string {
    const input = block.input || {};

    // Special handling for common tools
    if (block.name === 'Read' && input.file_path) {
      return this.truncate(String(input.file_path), 80);
    }

    if (block.name === 'Write' && input.file_path) {
      return this.truncate(String(input.file_path), 80);
    }

    if (block.name === 'Bash' && input.command) {
      const desc = input.description
        ? String(input.description)
        : String(input.command);
      return this.truncate(desc, 80);
    }

    if (block.name === 'Edit' && input.file_path) {
      return this.truncate(String(input.file_path), 80);
    }

    if (block.name === 'Grep' && input.pattern) {
      return this.truncate(`pattern: ${input.pattern}`, 80);
    }

    if (block.name === 'Glob' && input.pattern) {
      return this.truncate(`pattern: ${input.pattern}`, 80);
    }

    // Generic fallback - show first meaningful field
    const firstKey = Object.keys(input)[0];
    if (firstKey) {
      const value = input[firstKey];
      const valueStr =
        typeof value === 'string' ? value : JSON.stringify(value);
      return this.truncate(valueStr, 80);
    }

    return '(no input)';
  }

  private formatUserMessage(msg: StreamMessage): string | null {
    if (!msg.message?.content) return null;

    const content = msg.message.content;
    if (!Array.isArray(content)) return null;

    const parts: string[] = [];

    for (const block of content) {
      if (block.type === 'tool_result') {
        const resultStr = this.formatToolResult(block.content);
        parts.push(`${COLORS.dim}   ↳ Result: ${resultStr}${COLORS.reset}`);
      }
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }

  private formatToolResult(content: unknown): string {
    if (typeof content === 'string') {
      // Collapse multi-line to single line
      const singleLine = content
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return this.truncate(singleLine, 100);
    }

    if (content && typeof content === 'object') {
      return this.truncate(JSON.stringify(content), 100);
    }

    return '(empty)';
  }

  private formatResultMessage(msg: StreamMessage): string | null {
    if (msg.subtype === 'success' || !msg.is_error) {
      const cost = msg.total_cost_usd
        ? `$${msg.total_cost_usd.toFixed(4)}`
        : '';
      const duration = msg.duration_ms
        ? `${(msg.duration_ms / 1000).toFixed(1)}s`
        : '';
      const turns = msg.num_turns ? `${msg.num_turns} turns` : '';

      const stats = [cost, duration, turns].filter(Boolean).join(', ');
      return `${COLORS.green}✓ Complete${COLORS.reset}${stats ? ` (${stats})` : ''}`;
    }

    if (msg.is_error || msg.subtype === 'error') {
      const errorMsg = msg.result ? `: ${this.truncate(msg.result, 80)}` : '';
      return `${COLORS.red}✗ Error${errorMsg}${COLORS.reset}`;
    }

    return null;
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
  }
}
