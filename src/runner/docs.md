# Noridoc: runner

Path: @/src/runner

### Overview
- Orchestrates test execution by running `claude-code` in Docker containers for each discovered test file
- Handles both streaming and buffered output modes
- Determines test pass/fail by reading a status file written by the model

### How it fits into the larger codebase

- Called from `@/src/index.ts` via `runTests()` function
- Uses `ContainerManager` from `@/src/docker/container.ts` for container execution
- Uses utilities from `@/src/utils/` for test discovery, markdown manipulation, and status parsing
- Returns a `TestReport` object that the CLI uses for summary output and JSON reports

### Core Implementation

```
┌────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   runTests()   │────▶│  runSingleTest() │────▶│ ContainerManager │
│                │     │                  │     │                  │
│  - discovers   │     │  - reads .md     │     │  - runCommand()  │
│    test files  │     │  - appends       │     │    or            │
│  - loops       │     │    status instr  │     │  - runCommand-   │
│    through     │     │  - runs claude   │     │    Streaming()   │
│    tests       │     │  - parses status │     │                  │
└────────────────┘     └──────────────────┘     └──────────────────┘
```

**Test execution flow:**
1. Read markdown test file
2. Append status file instructions (path where model should write pass/fail)
3. Build claude-code command with `--output-format` based on stream mode
4. Execute in container (streaming or buffered)
5. Read and parse status file to determine pass/fail
6. Clean up temporary files

### Things to Know

- **Status file location**: Uses absolute path `${workDir}/.nori-test-status.json` which is in the container's mounted working directory
- **Mount path invariant**: The working directory is mounted at the same path in the container (`hostPath === containerPath`) to support nested Docker operations where inner containers also mount from host
- **Streaming mode**: When `options.stream` is true and `onOutput` callback is provided, uses `runCommandStreaming()` and invokes callback for each chunk
- **Output format switching**: Uses `--output-format stream-json` with `--verbose` when streaming, `--output-format text` otherwise (claude-code requires `--verbose` for `stream-json` in print mode)
- **Dry run mode**: Returns discovered tests without executing them (used for CI verification)
- **No status file = failure**: If the model doesn't write a status file, the test is treated as failed

Created and maintained by Nori.
