# Noridoc: src

Path: @/src

### Overview
- Entry point and core implementation for the nori-tests CLI
- Orchestrates test discovery, container execution, and result reporting
- Uses Commander.js for CLI argument parsing

### How it fits into the larger codebase

- CLI entry point (`index.ts`) accepts test folder path and options, then delegates to `@/src/runner/test-runner.ts`
- Types in `types.ts` define shared interfaces used across runner and container modules
- Options flow: CLI -> `RunOptions` -> `TestRunnerOptions` -> `RunCommandOptions`

```
+-------------+     +----------------+     +-------------------+
|  index.ts   | --> | test-runner.ts | --> | container.ts      |
| (CLI entry) |     | (orchestration)|     | (Docker execution)|
+-------------+     +----------------+     +-------------------+
                           |
                           v
                    +----------------+
                    | utils/         |
                    | - markdown.ts  |
                    | - status-file.ts|
                    | - test-discovery.ts|
                    +----------------+
```

### Core Implementation

- **CLI Options**: `--output`, `--keep-containers`, `--dry-run`, `--privileged`
- **API Key Handling**: Reads from `ANTHROPIC_API_KEY` env var or prompts user via TTY
- **Report Generation**: Collects `TestResult` objects, aggregates into `TestReport`, optionally writes JSON to file
- **Exit Codes**: 0 for all tests pass, 1 for any failure

### Things to Know

- `privileged` option flows through entire stack: CLI -> RunOptions -> TestRunnerOptions -> RunCommandOptions -> Docker HostConfig
- Containers are isolated by default (no Docker access); `--privileged` enables docker-in-docker capability
- Tests requiring Docker must use `--privileged` flag AND install/start Docker daemon themselves within the test markdown

Created and maintained by Nori.
