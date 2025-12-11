# Noridoc: docker

Path: @/src/docker

### Overview
- `ContainerManager` class wraps dockerode for container lifecycle management
- Provides `runCommand()` to execute commands in isolated containers
- Supports privileged mode for docker-in-docker scenarios

### How it fits into the larger codebase

- Called by `@/src/runner/test-runner.ts` to run claude-code in containers
- Receives `RunCommandOptions` which includes `privileged` flag from CLI
- Container output (stdout/stderr) is captured and returned to test runner

```
test-runner.ts
      |
      v
ContainerManager.runCommand()
      |
      +---> docker.createContainer()
      +---> container.start()
      +---> container.wait()
      +---> container.remove() (unless keepContainer)
```

### Core Implementation

- **Container Configuration**:
  - Runs as node user (UID 1000) because claude-code refuses `--dangerously-skip-permissions` as root
  - AutoRemove disabled to allow output capture before manual removal
  - `Privileged` set based on `options.privileged` (defaults to false)

- **Mount Strategy**: Host path mounted to same container path (e.g., `/home/user/project` -> `/home/user/project`)
  - Enables nested Docker mounts in docker-in-docker scenarios
  - Inner containers reference same host paths

- **Stream Handling**: Uses dockerode's `demuxStream()` to separate stdout/stderr from multiplexed Docker output

### Things to Know

- **Isolation by Default**: Containers have no Docker access unless `--privileged` is set
- **User ID**: Fixed to 1000:1000 (standard node user in official Node images)
- **No Socket Passthrough**: Docker socket is NOT mounted into containers; tests needing Docker must install it themselves in privileged mode
- **Output Flush**: 100ms delay after `container.wait()` ensures streams finish flushing before reading output

Created and maintained by Nori.
