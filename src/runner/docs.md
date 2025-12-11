# Noridoc: runner

Path: @/src/runner

### Overview
- Orchestrates test execution: discovers tests, runs each in a container, collects results
- Each test runs in an isolated container with claude-code
- Determines pass/fail by reading a status file written by claude-code

### How it fits into the larger codebase

- Called by `@/src/index.ts` with test folder path and options
- Uses `@/src/docker/container.ts` for container execution
- Uses `@/src/utils/markdown.ts` to append status file instructions to test prompts
- Uses `@/src/utils/test-discovery.ts` to find `.md` test files
- Uses `@/src/utils/status-file.ts` to parse the status JSON

```
index.ts
    |
    v
runTests(folderPath, options)
    |
    +---> discoverTests() -> list of .md files
    |
    +---> for each test:
              runSingleTest()
                  |
                  +---> appendStatusInstructions()
                  +---> containerManager.runCommand()
                  +---> parseStatusFile()
```

### Core Implementation

- **Test Discovery**: Finds all `.md` files in the specified folder
- **Prompt Construction**: Appends status file instructions to each test's markdown content
- **Container Execution**: Runs `npx @anthropic-ai/claude-code -p <prompt> --dangerously-skip-permissions --output-format text`
- **Status File**: Written to `${workDir}/.nori-test-status.json`; parsed after container exits
- **Mount Path**: Uses same path on host and container (`workDir` -> `workDir`) to support docker-in-docker scenarios

### Things to Know

- **Status File Location**: `${process.cwd()}/.nori-test-status.json` - absolute path used for both container and parsing
- **No Status File = Failure**: If claude-code doesn't write the status file, test is marked as failure
- **Prompt File Cleanup**: Temporary `.nori-test-prompt.md` file created and deleted in `finally` block
- **Privileged Passthrough**: `options.privileged` passed directly to `ContainerManager.runCommand()`
- **Same-Path Mount**: Host working directory mounted at identical path in container; enables nested docker mounts to resolve correctly

Created and maintained by Nori.
