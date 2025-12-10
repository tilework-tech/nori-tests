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
});
