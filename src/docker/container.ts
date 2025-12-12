import Docker from 'dockerode';
import { PassThrough } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar-stream';
import type { StreamChunk } from '../types.js';

// Get the GID of the Docker socket for proper permissions
function getDockerSocketGid(): number {
  try {
    const stats = fs.statSync('/var/run/docker.sock');
    return stats.gid;
  } catch {
    return 1000; // Fallback to default
  }
}

// Copy a file into a container using tar stream
async function copyFileToContainer(
  container: Docker.Container,
  hostFilePath: string,
  containerPath: string,
): Promise<void> {
  const pack = tar.pack();
  const fileContent = fs.readFileSync(hostFilePath);
  const fileName = path.basename(containerPath);

  // Add file to tar archive
  pack.entry(
    { name: fileName },
    fileContent,
    (err: Error | null | undefined) => {
      if (err) throw err;
      pack.finalize();
    },
  );

  // Put archive into container at the directory path
  const containerDir = path.dirname(containerPath);
  await container.putArchive(pack, { path: containerDir });
}

export interface MountConfig {
  hostPath: string;
  containerPath: string;
  readOnly?: boolean;
}

export interface RunCommandOptions {
  workDir: string;
  mounts?: MountConfig[];
  env?: Record<string, string>;
  sessionFileToCopy?: string | null;
  keepContainer?: boolean;
  containerName?: string;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type { StreamChunk } from '../types.js';

export class ContainerManager {
  private docker: Docker;

  constructor(socketPath: string = '/var/run/docker.sock') {
    this.docker = new Docker({ socketPath });
  }

  async runCommand(
    image: string,
    command: string[],
    options: RunCommandOptions,
  ): Promise<CommandResult> {
    // Prepare mounts (binds)
    const binds: string[] = [
      // Mount host Docker socket so tests can use Docker if needed
      '/var/run/docker.sock:/var/run/docker.sock',
    ];
    if (options.mounts) {
      for (const mount of options.mounts) {
        const mode = mount.readOnly ? 'ro' : 'rw';
        binds.push(`${mount.hostPath}:${mount.containerPath}:${mode}`);
      }
    }

    // Prepare environment variables
    const envArray: string[] = [];
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        envArray.push(`${key}=${value}`);
      }
    }

    // Create container
    // Run as node user (UID 1000) with docker socket GID for socket access
    // claude-code refuses --dangerously-skip-permissions as root
    const dockerGid = getDockerSocketGid();
    const container = await this.docker.createContainer({
      Image: image,
      Cmd: command,
      Tty: false,
      AttachStdout: true,
      AttachStderr: true,
      User: `1000:${dockerGid}`,
      WorkingDir: options.workDir,
      Env: envArray.length > 0 ? envArray : undefined,
      HostConfig: {
        Binds: binds,
        AutoRemove: false, // We'll remove manually after getting output
      },
      name: options.containerName,
    });

    // Copy session file if provided
    if (options.sessionFileToCopy) {
      // Create .claude directory in container first
      const execCreate = await container.exec({
        Cmd: ['mkdir', '-p', '/home/node/.claude'],
        AttachStdout: true,
        AttachStderr: true,
        User: '1000',
      });
      await execCreate.start({ Detach: false });

      // Copy session file to container
      await copyFileToContainer(
        container,
        options.sessionFileToCopy,
        '/home/node/.claude/.claude.json',
      );
    }

    // Attach to streams before starting
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    // Collect output
    let stdout = '';
    let stderr = '';

    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    stdoutStream.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    stderrStream.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Demux the stream
    this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

    // Start container
    await container.start();

    // Wait for container to finish
    const waitResult = await container.wait();

    // Give streams a moment to flush
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Clean up container unless keepContainer is true
    if (!options.keepContainer) {
      try {
        await container.remove({ force: true });
      } catch (_e) {
        // Ignore removal errors
      }
    }

    return {
      exitCode: waitResult.StatusCode,
      stdout,
      stderr,
    };
  }

  async *runCommandStreaming(
    image: string,
    command: string[],
    options: RunCommandOptions,
  ): AsyncGenerator<StreamChunk, number, unknown> {
    // Prepare mounts (binds)
    const binds: string[] = ['/var/run/docker.sock:/var/run/docker.sock'];
    if (options.mounts) {
      for (const mount of options.mounts) {
        const mode = mount.readOnly ? 'ro' : 'rw';
        binds.push(`${mount.hostPath}:${mount.containerPath}:${mode}`);
      }
    }

    // Prepare environment variables
    const envArray: string[] = [];
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        envArray.push(`${key}=${value}`);
      }
    }

    // Create container
    const dockerGid = getDockerSocketGid();
    const container = await this.docker.createContainer({
      Image: image,
      Cmd: command,
      Tty: false,
      AttachStdout: true,
      AttachStderr: true,
      User: `1000:${dockerGid}`,
      WorkingDir: options.workDir,
      Env: envArray.length > 0 ? envArray : undefined,
      HostConfig: {
        Binds: binds,
        AutoRemove: false,
      },
      name: options.containerName,
    });

    // Copy session file if provided
    if (options.sessionFileToCopy) {
      // Create .claude directory in container first
      const execCreate = await container.exec({
        Cmd: ['mkdir', '-p', '/home/node/.claude'],
        AttachStdout: true,
        AttachStderr: true,
        User: '1000',
      });
      await execCreate.start({ Detach: false });

      // Copy session file to container
      await copyFileToContainer(
        container,
        options.sessionFileToCopy,
        '/home/node/.claude/.claude.json',
      );
    }

    // Attach to streams before starting
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    // Create a queue to hold chunks as they arrive
    const chunkQueue: StreamChunk[] = [];
    let resolveWaiting: (() => void) | null = null;
    let streamEnded = false;

    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    stdoutStream.on('data', (chunk: Buffer) => {
      chunkQueue.push({ type: 'stdout', data: chunk.toString() });
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    });

    stderrStream.on('data', (chunk: Buffer) => {
      chunkQueue.push({ type: 'stderr', data: chunk.toString() });
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    });

    // Demux the stream
    this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

    // Start container
    await container.start();

    // Wait for container to finish in the background
    const waitPromise = container.wait().then((result) => {
      streamEnded = true;
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
      return result;
    });

    // Yield chunks as they arrive
    while (!streamEnded || chunkQueue.length > 0) {
      if (chunkQueue.length > 0) {
        yield chunkQueue.shift()!;
      } else if (!streamEnded) {
        // Wait for more data
        await new Promise<void>((resolve) => {
          resolveWaiting = resolve;
        });
      }
    }

    // Wait for container to finish
    const waitResult = await waitPromise;

    // Clean up container unless keepContainer is true
    if (!options.keepContainer) {
      try {
        await container.remove({ force: true });
      } catch (_e) {
        // Ignore removal errors
      }
    }

    return waitResult.StatusCode;
  }

  async pullImage(image: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(
        image,
        (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) {
            reject(err);
            return;
          }

          this.docker.modem.followProgress(stream, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        },
      );
    });
  }
}
