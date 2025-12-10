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
- `-V, --version` - Output version number
- `-h, --help` - Display help

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

- `ANTHROPIC_API_KEY` - Required. Your Anthropic API key. Will prompt if not set.

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

## Requirements

- Node.js >= 18.0.0
- Docker running locally
- Valid Anthropic API key

## License

ISC
