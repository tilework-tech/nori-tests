import Docker from 'dockerode';
import { PassThrough } from 'stream';

export interface MountConfig {
  hostPath: string;
  containerPath: string;
  readOnly?: boolean;
}

export interface RunCommandOptions {
  workDir: string;
  mounts?: MountConfig[];
  env?: Record<string, string>;
  keepContainer?: boolean;
  containerName?: string;
  privileged?: boolean;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

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
    const binds: string[] = [];
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
    // Run as node user (UID 1000) - claude-code refuses --dangerously-skip-permissions as root
    const container = await this.docker.createContainer({
      Image: image,
      Cmd: command,
      Tty: false,
      AttachStdout: true,
      AttachStderr: true,
      User: '1000:1000',
      WorkingDir: options.workDir,
      Env: envArray.length > 0 ? envArray : undefined,
      HostConfig: {
        Binds: binds.length > 0 ? binds : undefined,
        AutoRemove: false, // We'll remove manually after getting output
        Privileged: options.privileged || false,
      },
      name: options.containerName,
    });

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
