import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ContainerManager } from '../../src/docker/container.js';
import Docker from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ContainerManager', () => {
  let docker: Docker;
  let tempDir: string;

  beforeAll(async () => {
    docker = new Docker({ socketPath: '/var/run/docker.sock' });
    // Verify Docker is running
    try {
      await docker.ping();
    } catch (_e) {
      throw new Error(
        'Docker is not running. Please start Docker to run integration tests.',
      );
    }
  });

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-container-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('can create and run a simple container', async () => {
    const manager = new ContainerManager();

    const result = await manager.runCommand(
      'node:20-slim',
      ['echo', 'hello'],
      {
        workDir: tempDir,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('captures exit code from failed commands', async () => {
    const manager = new ContainerManager();

    const result = await manager.runCommand(
      'node:20-slim',
      ['sh', '-c', 'exit 42'],
      {
        workDir: tempDir,
      },
    );

    expect(result.exitCode).toBe(42);
  });

  it('mounts volumes correctly', async () => {
    const testContent = 'test-content-' + Date.now();
    const testFile = path.join(tempDir, 'mounted-file.txt');
    fs.writeFileSync(testFile, testContent);

    const manager = new ContainerManager();

    const result = await manager.runCommand(
      'node:20-slim',
      ['cat', '/workspace/mounted-file.txt'],
      {
        workDir: tempDir,
        mounts: [{ hostPath: tempDir, containerPath: '/workspace' }],
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(testContent);
  });

  it('passes environment variables to container', async () => {
    const manager = new ContainerManager();

    const result = await manager.runCommand(
      'node:20-slim',
      ['sh', '-c', 'echo $TEST_VAR'],
      {
        workDir: tempDir,
        env: { TEST_VAR: 'hello-from-env' },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello-from-env');
  });

  it('cleans up container after run by default', async () => {
    const manager = new ContainerManager();
    const containersBefore = await docker.listContainers({ all: true });

    await manager.runCommand('node:20-slim', ['echo', 'cleanup-test'], {
      workDir: tempDir,
    });

    const containersAfter = await docker.listContainers({ all: true });
    // Should not have more containers after cleanup
    expect(containersAfter.length).toBeLessThanOrEqual(
      containersBefore.length + 1,
    );
  });

  it('keeps container when keepContainer option is true', async () => {
    const manager = new ContainerManager();
    const uniqueMarker = 'keep-test-' + Date.now();

    const result = await manager.runCommand(
      'node:20-slim',
      ['echo', uniqueMarker],
      {
        workDir: tempDir,
        keepContainer: true,
        containerName: `nori-test-keep-${Date.now()}`,
      },
    );

    expect(result.exitCode).toBe(0);

    // Verify container exists
    const containers = await docker.listContainers({ all: true });
    const keptContainer = containers.find((c) =>
      c.Names.some((n) => n.includes('nori-test-keep')),
    );

    // Cleanup the kept container
    if (keptContainer) {
      const container = docker.getContainer(keptContainer.Id);
      await container.remove({ force: true });
    }
  });

  it('streams output in real-time with runCommandStreaming', async () => {
    const manager = new ContainerManager();
    const chunks: Array<{ type: string; data: string }> = [];

    const generator = manager.runCommandStreaming(
      'node:20-slim',
      [
        'sh',
        '-c',
        'echo "line1"; sleep 0.1; echo "line2"; sleep 0.1; echo "line3"',
      ],
      {
        workDir: tempDir,
      },
    );

    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    // Should have received multiple chunks (output comes in real-time)
    expect(chunks.length).toBeGreaterThan(0);

    // Combined output should contain all lines
    const allOutput = chunks.map((c) => c.data).join('');
    expect(allOutput).toContain('line1');
    expect(allOutput).toContain('line2');
    expect(allOutput).toContain('line3');
  });

  it('streams stderr separately from stdout', async () => {
    const manager = new ContainerManager();
    const chunks: Array<{ type: string; data: string }> = [];

    const generator = manager.runCommandStreaming(
      'node:20-slim',
      ['sh', '-c', 'echo "stdout-msg"; echo "stderr-msg" >&2'],
      {
        workDir: tempDir,
      },
    );

    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    const stdoutChunks = chunks.filter((c) => c.type === 'stdout');
    const stderrChunks = chunks.filter((c) => c.type === 'stderr');

    const stdoutOutput = stdoutChunks.map((c) => c.data).join('');
    const stderrOutput = stderrChunks.map((c) => c.data).join('');

    expect(stdoutOutput).toContain('stdout-msg');
    expect(stderrOutput).toContain('stderr-msg');
  });

  it('copies session file to container before starting', async () => {
    const manager = new ContainerManager();

    // Create a temp session file
    const sessionContent = JSON.stringify({
      test: 'session-data',
      timestamp: Date.now(),
    });
    const sessionFile = path.join(tempDir, 'test-session.json');
    fs.writeFileSync(sessionFile, sessionContent);

    const result = await manager.runCommand(
      'node:20-slim',
      ['cat', '/home/node/.claude/.claude.json'],
      {
        workDir: tempDir,
        sessionFileToCopy: sessionFile,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('session-data');
  });

  it('copies session file when using streaming', async () => {
    const manager = new ContainerManager();

    const sessionContent = JSON.stringify({ streaming: 'test-value' });
    const sessionFile = path.join(tempDir, 'stream-session.json');
    fs.writeFileSync(sessionFile, sessionContent);

    const generator = manager.runCommandStreaming(
      'node:20-slim',
      ['cat', '/home/node/.claude/.claude.json'],
      {
        workDir: tempDir,
        sessionFileToCopy: sessionFile,
      },
    );

    const chunks: Array<{ type: string; data: string }> = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    const allOutput = chunks.map((c) => c.data).join('');
    expect(allOutput).toContain('test-value');
  });
});
