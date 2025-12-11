export type TestStatus = 'success' | 'failure';

export interface StatusFile {
  status: TestStatus;
  error?: string;
}

export interface TestResult {
  testFile: string;
  status: TestStatus;
  error?: string;
  durationMs: number;
}

export interface TestReport {
  totalTests: number;
  passed: number;
  failed: number;
  results: TestResult[];
  durationMs: number;
}

export interface RunOptions {
  outputFile?: string;
  keepContainers?: boolean;
  privileged?: boolean;
}
