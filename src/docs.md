# Noridoc: src

Path: @/src

### Overview
- CLI tool that runs integration tests by executing `claude-code` in isolated Docker containers
- Discovers `.md` test files in a folder, passes them to `claude-code`, and reports results based on a status file written by the model
- Supports both buffered and streaming output modes for real-time visibility into model processing

### How it fits into the larger codebase

- Entry point (`index.ts`) parses CLI arguments and orchestrates the test run
- Delegates container management to `@/src/docker/container.ts`
- Delegates test execution to `@/src/runner/test-runner.ts`
- Uses utilities from `@/src/utils/` for test discovery, markdown manipulation, and status file parsing
- Communicates test results via JSON reports and exit codes

### Core Implementation

- **CLI parsing**: Uses `commander` to parse arguments including `--stream`, `--dry-run`, `--keep-containers`, `--output`
- **API key handling**: Reads from `ANTHROPIC_API_KEY` env var or prompts interactively if TTY available
- **Streaming callback**: When `--stream` flag is set, the CLI provides an `onOutput` callback that writes chunks to stdout (or stderr in red for stderr chunks)
- **Test result communication**: Tests pass/fail by writing a JSON status file (`{ status: "success" | "failure" }`)

### Things to Know

- The `StreamChunk` interface (`{ type: 'stdout' | 'stderr', data: string }`) is duplicated in both `types.ts` and `docker/container.ts` - this is intentional to keep the docker module self-contained
- When streaming, `claude-code` is invoked with `--output-format stream-json` instead of `text`
- Exit code is 0 on all tests passing, 1 if any test fails
- Temporary files (`.nori-test-prompt.md`, `.nori-test-status.json`) are created in the working directory during test execution

Created and maintained by Nori.
