# nori-tests

CLI tool for running integration tests with claude-code in isolated Docker containers.

## Installation

```bash
npm install -g nori-tests
```

Or use directly with npx:
```bash
npx nori-tests <folder>
```

## Usage

```bash
nori-tests <folder> [options]
```

### Arguments

- `folder` - Path to folder containing test markdown files

### Options

- `-o, --output <file>` - Output JSON report to file
- `--keep-containers` - Keep containers after tests for debugging
- `--dry-run` - Discover tests without running them
- `--stream` - Stream model output to terminal in real-time
- `--prefer-session` - Use Claude session instead of API key when both are available
- `-V, --version` - Output version number
- `-h, --help` - Display help

## Authentication Methods

nori-tests supports two authentication methods:

### 1. API Key (Default)

Set the `ANTHROPIC_API_KEY` environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
nori-tests ./tests
```

### 2. Claude Max Subscription

If you have a Claude Pro or Max plan, you can use your subscription:

```bash
# Login to Claude (one-time setup)
npx @anthropic-ai/claude-code login

# Run tests using your subscription
nori-tests ./tests
```

### Priority

By default, if both an API key and Claude session are available, the API key takes precedence to prevent unexpected billing.

To prefer your Claude subscription when both are available:

```bash
nori-tests ./tests --prefer-session
```

When both authentication methods are detected and you're using the API key, nori-tests will display a warning:

```
⚠️  Warning: Both ANTHROPIC_API_KEY and Claude session found.
   Using API key (may incur charges).
   Use --prefer-session to use your subscription instead.
```

### Authentication Status

nori-tests displays which authentication method is being used:

```
nori-tests v1.0.0
================
Authentication: Claude Session
Test folder: ./tests
Tests found: 5
```

## How It Works

1. Each `.md` file in the test folder represents a single integration test
2. nori-tests spins up an isolated Docker container for each test
3. The markdown content is passed to claude-code with `--dangerously-skip-permissions`
4. Claude Code is instructed to write a status file indicating success or failure
5. Results are collected and reported

## Test File Format

Test files are standard markdown files describing what Claude should do:

```markdown
# My Test

Create a file called `output.txt` with the content "Hello, World!".

Verify the file was created successfully.
```

nori-tests automatically appends instructions telling Claude to write a status file:

```json
{
  "status": "success"
}
```

Or on failure:
```json
{
  "status": "failure",
  "error": "Description of what went wrong"
}
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Your Anthropic API key (optional if using Claude session)

## Examples

### Dry run to discover tests

```bash
nori-tests ./tests --dry-run
```

### Run tests with JSON report

```bash
nori-tests ./tests --output report.json
```

### Keep containers for debugging

```bash
nori-tests ./tests --keep-containers
```

## Troubleshooting

### Authentication Errors

If you see "No authentication method available":

1. Check if you have an API key: `echo $ANTHROPIC_API_KEY`
2. Check if you're logged into Claude: `npx @anthropic-ai/claude-code whoami`
3. If neither exists, either:
   - Set your API key: `export ANTHROPIC_API_KEY=sk-ant-api03-...`
   - Login to Claude: `npx @anthropic-ai/claude-code login`

### "Both API key and Claude session found" Warning

This warning appears when you have both authentication methods available. By default, nori-tests uses your API key to avoid confusion about which plan is being billed.

To use your Claude subscription instead:
```bash
nori-tests ./tests --prefer-session
```

Or to always use your session, remove the API key:
```bash
unset ANTHROPIC_API_KEY
```

### Session Expired

If tests fail with authentication errors but you have a session file, your session may have expired:

```bash
npx @anthropic-ai/claude-code logout
npx @anthropic-ai/claude-code login
```

## Requirements

- Node.js >= 18.0.0
- Docker running locally
- Valid Anthropic API key OR Claude Pro/Max subscription

## License

ISC
