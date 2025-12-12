# Noridoc: docker

Path: @/src/docker

### Overview
- Provides `ContainerManager` class for running commands in Docker containers
- Supports both buffered execution (`runCommand`) and streaming execution (`runCommandStreaming`) via async generators
- Handles container lifecycle, mounts, environment variables, and cleanup

### How it fits into the larger codebase

- Used by `@/src/runner/test-runner.ts` to execute `claude-code` in isolated containers
- Abstracts Docker API complexity from the test runner
- Streaming capability enables real-time output display in the CLI when `--stream` flag is used

### Core Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                    ContainerManager                          │
├─────────────────────────────────────────────────────────────┤
│  runCommand()         - Buffered execution, returns all     │
│                         stdout/stderr after completion       │
│                                                              │
│  runCommandStreaming() - Async generator that yields        │
│                          StreamChunk as output arrives       │
│                                                              │
│  pullImage()          - Pull Docker image from registry      │
└─────────────────────────────────────────────────────────────┘
```

**Buffered mode (`runCommand`):**
1. Creates container with specified image, command, mounts, and env vars
2. Attaches to stdout/stderr streams
3. Starts container and waits for completion
4. Returns `CommandResult` with exitCode, stdout, stderr

**Streaming mode (`runCommandStreaming`):**
1. Creates container identically to buffered mode
2. Sets up a chunk queue with a resolve callback pattern
3. Starts container and begins yielding chunks as they arrive
4. Returns exit code when generator completes

### Things to Know

- **Docker socket permissions**: Containers run as UID 1000 (node user) with GID matching the host Docker socket to allow nested Docker operations
- **DinD support**: The host Docker socket is always mounted at `/var/run/docker.sock` to enable Docker-in-Docker patterns
- **Chunk queue pattern**: The streaming implementation uses a queue + resolve callback to convert push-based Node.js streams into pull-based async iteration
- **Demux requirement**: Docker's multiplexed stream format requires `docker.modem.demuxStream()` to separate stdout from stderr
- **Container cleanup**: Containers are removed after execution unless `keepContainer: true` is set
- **Session file copying**: Uses `tar-stream` and `container.putArchive()` to copy session files into stopped containers. This is required because Docker's `exec` API only works on running containers, but session files must be copied before `container.start()`. File ownership is set via tar headers (uid/gid 1000) rather than chown.

Created and maintained by Nori.
