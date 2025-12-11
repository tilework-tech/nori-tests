import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ContainerManager } from '../../src/docker/container.js';
import Docker from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ContainerManager options', () => {
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-container-opts-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('does not mount Docker socket by default', async () => {
    const manager = new ContainerManager();

    // Run a container that tries to access Docker socket
    // If socket is not mounted, /var/run/docker.sock won't exist
    const result = await manager.runCommand(
      'node:20-slim',
      [
        'sh',
        '-c',
        'test -S /var/run/docker.sock && echo "socket exists" || echo "no socket"',
      ],
      {
        workDir: tempDir,
      },
    );

    expect(result.exitCode).toBe(0);
    // Should NOT find the Docker socket
    expect(result.stdout).toContain('no socket');
  });

  it('passes privileged option to container when enabled', async () => {
    const manager = new ContainerManager();

    // In privileged mode, all capabilities are available in the bounding set (CapBnd)
    // Even when running as non-root user, CapBnd shows full capabilities
    const result = await manager.runCommand(
      'node:20-slim',
      ['sh', '-c', "grep CapBnd /proc/self/status | awk '{print $2}'"],
      {
        workDir: tempDir,
        privileged: true,
      },
    );

    expect(result.exitCode).toBe(0);
    // Privileged containers have all capabilities in bounding set (1ffffffffff pattern)
    expect(result.stdout.trim()).toMatch(/^0*1f+$/);
  });

  it('does not set privileged by default', async () => {
    const manager = new ContainerManager();

    // Without privileged mode, the bounding set has limited capabilities
    const result = await manager.runCommand(
      'node:20-slim',
      ['sh', '-c', "grep CapBnd /proc/self/status | awk '{print $2}'"],
      {
        workDir: tempDir,
      },
    );

    expect(result.exitCode).toBe(0);
    // Non-privileged containers have limited capabilities in bounding set
    expect(result.stdout.trim()).not.toMatch(/^0*1f+$/);
  });
});
