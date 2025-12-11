import * as fs from 'fs';
import * as path from 'path';
import type { TestReport, TestResult, RunOptions } from '../types.js';
import { ContainerManager } from '../docker/container.js';
import { appendStatusInstructions } from '../utils/markdown.js';
import { parseStatusFile } from '../utils/status-file.js';
import { discoverTests } from '../utils/test-discovery.js';

const STATUS_FILE_PATH = '/workspace/.nori-test-status.json';
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

  // Append status instructions
  const fullPrompt = appendStatusInstructions(markdown, STATUS_FILE_PATH);

  // Get the working directory (where nori-tests was invoked)
  const workDir = process.cwd();

  // Create temp file for the prompt
  const promptFile = path.join(workDir, '.nori-test-prompt.md');
  fs.writeFileSync(promptFile, fullPrompt);

  try {
    // Run claude-code in container
    // We use a shell wrapper to:
    // 1. Install Docker as root (for tests that need DinD)
    // 2. Start dockerd in background
    // 3. Switch to node user (uid 1000) to run claude-code
    const shellScript = `
      # Install Docker if not present
      if ! command -v docker &> /dev/null; then
        apt-get update && apt-get install -y docker.io >/dev/null 2>&1 || true
      fi

      # Start dockerd in background if we have Docker
      if command -v dockerd &> /dev/null; then
        dockerd &>/dev/null &
        # Wait for Docker to be ready (up to 30 seconds)
        for i in $(seq 1 30); do
          if docker info >/dev/null 2>&1; then
            break
          fi
          sleep 1
        done
        # Add node user to docker group so it can access the socket
        groupadd -f docker 2>/dev/null || true
        usermod -aG docker node 2>/dev/null || true
        # Also chmod the socket as a fallback
        chmod 666 /var/run/docker.sock 2>/dev/null || true
      fi

      # Switch to node user and run claude-code
      # Pass prompt via file since it may contain special characters
      su -s /bin/bash node -c 'npx @anthropic-ai/claude-code -p "$(cat /workspace/.nori-test-prompt.md)" --dangerously-skip-permissions --output-format text'
    `;

    const _result = await containerManager.runCommand(
      CLAUDE_CODE_IMAGE,
      [
        'bash',
        '-c',
        shellScript,
      ],
      {
        workDir,
        mounts: [{ hostPath: workDir, containerPath: '/workspace' }],
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
    const statusFilePath = path.join(workDir, '.nori-test-status.json');

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
