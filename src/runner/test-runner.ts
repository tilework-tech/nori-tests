import * as fs from 'fs';
import * as path from 'path';
import type { TestReport, TestResult, RunOptions } from '../types.js';
import { ContainerManager } from '../docker/container.js';
import { appendStatusInstructions } from '../utils/markdown.js';
import { parseStatusFile } from '../utils/status-file.js';
import { discoverTests } from '../utils/test-discovery.js';

const STATUS_FILE_NAME = '.nori-test-status.json';
const CLAUDE_CODE_IMAGE = 'node:20'; // Will be replaced with actual devcontainer

export interface TestRunnerOptions extends RunOptions {
  apiKey: string;
  dryRun?: boolean;
}

export async function runTests(
  folderPath: string,
  options: TestRunnerOptions,
): Promise<TestReport> {
  const startTime = Date.now();
  const testFiles = discoverTests(folderPath);

  const results: TestResult[] = [];

  if (options.dryRun) {
    // In dry-run mode, just return discovered tests without running
    for (const testFile of testFiles) {
      results.push({
        testFile: path.basename(testFile),
        status: 'success',
        durationMs: 0,
      });
    }

    return {
      totalTests: testFiles.length,
      passed: testFiles.length,
      failed: 0,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  const containerManager = new ContainerManager();

  for (let i = 0; i < testFiles.length; i++) {
    const testFile = testFiles[i];
    const testName = path.basename(testFile);

    console.log(`\n[${i + 1}/${testFiles.length}] Running: ${testName}`);

    const testStartTime = Date.now();

    try {
      const result = await runSingleTest(containerManager, testFile, options);

      results.push({
        ...result,
        testFile: testName,
      });

      if (result.status === 'success') {
        console.log(`  ✓ PASSED (${result.durationMs}ms)`);
      } else {
        console.log(`  ✗ FAILED: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      const durationMs = Date.now() - testStartTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      results.push({
        testFile: testName,
        status: 'failure',
        error: errorMessage,
        durationMs,
      });

      console.log(`  ✗ ERROR: ${errorMessage}`);
    }
  }

  const passed = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failure').length;

  return {
    totalTests: testFiles.length,
    passed,
    failed,
    results,
    durationMs: Date.now() - startTime,
  };
}

async function runSingleTest(
  containerManager: ContainerManager,
  testFile: string,
  options: TestRunnerOptions,
): Promise<Omit<TestResult, 'testFile'>> {
  const startTime = Date.now();

  // Read test markdown
  const markdown = fs.readFileSync(testFile, 'utf-8');

  // Get the working directory (where nori-tests was invoked)
  const workDir = process.cwd();

  // Status file path - use absolute path based on workDir
  const statusFilePath = path.join(workDir, STATUS_FILE_NAME);

  // Append status instructions
  const fullPrompt = appendStatusInstructions(markdown, statusFilePath);

  // Create temp file for the prompt
  const promptFile = path.join(workDir, '.nori-test-prompt.md');
  fs.writeFileSync(promptFile, fullPrompt);

  try {
    // Run claude-code in container
    const _result = await containerManager.runCommand(
      CLAUDE_CODE_IMAGE,
      [
        'npx',
        '@anthropic-ai/claude-code',
        '-p',
        fullPrompt,
        '--dangerously-skip-permissions',
        '--output-format',
        'text',
      ],
      {
        workDir,
        // Mount to same path as host to support nested Docker (DinD)
        // When running in DinD, inner containers also mount from host Docker
        mounts: [{ hostPath: workDir, containerPath: workDir }],
        env: {
          ANTHROPIC_API_KEY: options.apiKey,
        },
        keepContainer: options.keepContainers,
        containerName: options.keepContainers
          ? `nori-test-${path.basename(testFile, '.md')}-${Date.now()}`
          : undefined,
      },
    );

    // Check for status file
    if (fs.existsSync(statusFilePath)) {
      const statusContent = fs.readFileSync(statusFilePath, 'utf-8');
      const status = parseStatusFile(statusContent);

      // Clean up status file
      fs.unlinkSync(statusFilePath);

      return {
        status: status.status,
        error: status.error,
        durationMs: Date.now() - startTime,
      };
    }

    // No status file - treat as failure
    return {
      status: 'failure',
      error:
        'No status file was created. Claude may not have completed the task.',
      durationMs: Date.now() - startTime,
    };
  } finally {
    // Clean up prompt file
    if (fs.existsSync(promptFile)) {
      fs.unlinkSync(promptFile);
    }
  }
}
