import type { StatusFile, TestStatus } from '../types.js';

const VALID_STATUSES: TestStatus[] = ['success', 'failure'];

export function parseStatusFile(content: string): StatusFile {
  const trimmed = content.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Invalid JSON in status file: ${(e as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Status file must contain a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (!('status' in obj)) {
    throw new Error('Status file missing required "status" field');
  }

  if (
    typeof obj.status !== 'string' ||
    !VALID_STATUSES.includes(obj.status as TestStatus)
  ) {
    throw new Error(
      `Invalid status value: "${obj.status}". Must be "success" or "failure"`,
    );
  }

  const result: StatusFile = {
    status: obj.status as TestStatus,
  };

  if ('error' in obj && typeof obj.error === 'string') {
    result.error = obj.error;
  }

  return result;
}
