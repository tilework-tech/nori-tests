# Claude Max Authentication Support Implementation Plan

**Goal:** Enable nori-tests to support Claude Max subscription-based authentication in addition to ANTHROPIC_API_KEY, allowing users with Claude Pro/Max plans to run tests without needing separate API keys.

**Architecture:** Implement a multi-source authentication system that checks for Claude session tokens (`.claude.json`), falls back to API keys, and properly handles both in containerized test environments. The system will detect session files, mount them into containers when available, and maintain backward compatibility with API key-only workflows.

**Tech Stack:** TypeScript, Node.js fs/path modules, Docker volume mounts, Claude CLI session management

---

## Testing Plan

**Unit Tests (New File: `tests/unit/auth.test.ts`)**

I will add unit tests for:
1. A new `getAuthMethod()` function that detects which authentication source is available (session file vs API key vs none)
2. A new `findClaudeSessionFile()` function that locates `.claude.json` in standard locations (~/.claude, project root)
3. A new `getAuthConfig()` function that returns the appropriate authentication configuration for container execution

These tests will verify the authentication detection logic works correctly without requiring actual API calls or Docker containers.

**Integration Tests (Modified: `tests/integration/cli.test.ts`)**

I will add integration tests for:
1. Running tests with only a `.claude.json` session file (mocked) and no API key
2. Running tests with both session file and API key (API key should take precedence per current Claude CLI behavior)
3. Detecting when no authentication is available and failing with appropriate error message
4. Verifying the session file is correctly mounted into the Docker container

**Integration Tests (Modified: `tests/integration/container.test.ts`)**

I will add tests for:
1. Mounting additional files (like `.claude.json`) into containers
2. Verifying environment variables are correctly set when using session-based auth

NOTE: I will write *all* tests before I add any implementation behavior.

---

## Implementation Steps

### Phase 1: Authentication Detection (TDD)

**Step 1:** Write failing unit test for `findClaudeSessionFile()` function
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/tests/unit/auth.test.ts` (new file)
- **Test:** Should find `.claude.json` in `~/.claude/` directory when it exists
- **Test:** Should find `.claude.json` in current working directory when it exists
- **Test:** Should prefer `~/.claude/.claude.json` over local `.claude.json`
- **Test:** Should return `null` when no session file exists

**Step 2:** Run test to verify it fails
- **Command:** `npm test tests/unit/auth.test.ts`
- **Expected:** Test failures because `findClaudeSessionFile()` doesn't exist yet

**Step 3:** Create authentication utility module
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/src/utils/auth.ts` (new file)
- **Function:** `findClaudeSessionFile(): string | null`
  - Check `~/.claude/.claude.json` first (using `os.homedir()`)
  - Check `./.claude.json` second
  - Return path if exists, null otherwise

**Step 4:** Run tests and verify they pass
- **Command:** `npm test tests/unit/auth.test.ts`
- **Expected:** All tests pass

**Step 5:** Write failing unit test for `getAuthMethod()` function
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/tests/unit/auth.test.ts`
- **Test:** Should return `{ type: 'session', sessionFile: '/path/to/.claude.json' }` when session file exists
- **Test:** Should return `{ type: 'api-key', apiKey: 'sk-...' }` when only API key is in env
- **Test:** Should return `{ type: 'api-key', apiKey: 'sk-...' }` when both session and API key exist (API key takes precedence)
- **Test:** Should return `{ type: 'none' }` when no auth is available

**Step 6:** Run test to verify it fails
- **Command:** `npm test tests/unit/auth.test.ts`
- **Expected:** Test failures because `getAuthMethod()` doesn't exist yet

**Step 7:** Implement `getAuthMethod()` function
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/src/utils/auth.ts`
- **Function:** `getAuthMethod(preferSession?: boolean): AuthMethod`
  - If `preferSession` is true, check session file first, then API key
  - Otherwise (default): Check for `process.env.ANTHROPIC_API_KEY` first (highest priority)
  - If API key exists and not preferring session, return `{ type: 'api-key', apiKey }`
  - Otherwise, call `findClaudeSessionFile()`
  - If session file exists, return `{ type: 'session', sessionFile }`
  - If no session but API key exists, return `{ type: 'api-key', apiKey }`
  - Otherwise, return `{ type: 'none' }`

**Step 8:** Run tests and verify they pass
- **Command:** `npm test tests/unit/auth.test.ts`
- **Expected:** All tests pass

**Step 9:** Write failing unit test for `getAuthConfig()` function
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/tests/unit/auth.test.ts`
- **Test:** For API key auth, should return env vars with `ANTHROPIC_API_KEY` and empty mounts
- **Test:** For session auth, should return env vars with placeholder and mount for `.claude.json`
- **Test:** For no auth, should throw an error

**Step 10:** Run test to verify it fails
- **Command:** `npm test tests/unit/auth.test.ts`
- **Expected:** Test failures because `getAuthConfig()` doesn't exist yet

**Step 11:** Implement `getAuthConfig()` function
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/src/utils/auth.ts`
- **Function:** `getAuthConfig(): AuthConfig`
  - Get auth method from `getAuthMethod()`
  - For 'api-key': return `{ env: { ANTHROPIC_API_KEY: apiKey }, sessionFileToCopy: null }`
  - For 'session': return `{ env: {}, sessionFileToCopy: sessionFile }` (will be copied into container)
  - For 'none': throw error "No authentication method available"

**Step 12:** Run tests and verify they pass
- **Command:** `npm test tests/unit/auth.test.ts`
- **Expected:** All tests pass

**Step 13:** Commit authentication detection logic
- **Command:** `git add src/utils/auth.ts tests/unit/auth.test.ts && git commit -m "Add authentication detection utilities"`

### Phase 2: Integration with CLI (TDD)

**Step 14:** Write failing integration test for session-based auth
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/tests/integration/cli.test.ts`
- **Test:** "accepts session file authentication when no API key is set"
  - Mock a `.claude.json` file in temp directory
  - Set `HOME` env var to temp directory
  - Unset `ANTHROPIC_API_KEY`
  - Run CLI with `--dry-run`
  - Should complete successfully

**Step 15:** Run test to verify it fails
- **Command:** `npm test tests/integration/cli.test.ts`
- **Expected:** Test fails because CLI doesn't check for session file yet

**Step 16:** Modify CLI entry point to use new auth detection
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/src/index.ts`
- **Changes:**
  - Add `--prefer-session` option to program
  - Import `getAuthMethod` from `./utils/auth.js`
  - Replace `getApiKey()` call with `getAuthMethod(options.preferSession)`
  - Update logic to handle both 'api-key' and 'session' auth types
  - Pass auth type info to `runTests()`

**Step 17:** Run tests and verify integration test passes
- **Command:** `npm test tests/integration/cli.test.ts`
- **Expected:** New test passes

**Step 18:** Write failing integration test for API key priority
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/tests/integration/cli.test.ts`
- **Test:** "prioritizes API key over session file when both exist"
  - Mock a `.claude.json` file in temp directory
  - Set `ANTHROPIC_API_KEY` env var
  - Run CLI with `--dry-run`
  - Verify API key is used (check container env vars in logs)

**Step 19:** Run test to verify behavior is already correct
- **Command:** `npm test tests/integration/cli.test.ts`
- **Expected:** Test should pass due to our priority implementation in `getAuthMethod()`

**Step 20:** Commit CLI integration
- **Command:** `git add src/index.ts tests/integration/cli.test.ts && git commit -m "Integrate session-based auth into CLI"`

### Phase 3: Container Volume Mounting (TDD)

**Step 21:** Write failing test for copying session file into container
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/tests/integration/container.test.ts`
- **Test:** "copies session file into container at correct path"
  - Create temp `.claude.json` file
  - Run container with session file copy option
  - Execute `cat ~/.claude/.claude.json` in container
  - Verify file contents match host file

**Step 22:** Run test to verify it fails
- **Command:** `npm test tests/integration/container.test.ts`
- **Expected:** Test fails because container doesn't mount session file yet

**Step 23:** Update container manager to support session file copying
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/src/docker/container.ts`
- **Changes:**
  - Extend `runCommand` to accept `sessionFileToCopy` option
  - Before running command, if `sessionFileToCopy` is provided:
    - Read session file contents from host
    - Create `~/.claude` directory in container via `container.exec(['mkdir', '-p', '/root/.claude'])`
    - Write session file to container via `container.putArchive()` or similar
  - Ensure file is written to `/root/.claude/.claude.json` in container

**Step 24:** Run tests and verify they pass
- **Command:** `npm test tests/integration/container.test.ts`
- **Expected:** All tests pass

**Step 25:** Update test runner to use auth config
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/src/runner/test-runner.ts`
- **Changes:**
  - Import `getAuthConfig` from `../utils/auth.js`
  - Replace hardcoded `ANTHROPIC_API_KEY` env var with auth config
  - Pass `sessionFileToCopy` to container when using session auth
  - Update `TestRunnerOptions` interface to remove `apiKey` and use auth config instead

**Step 26:** Run all tests to verify end-to-end flow
- **Command:** `npm test`
- **Expected:** All 55+ tests pass

**Step 27:** Commit container integration
- **Command:** `git add src/docker/container.ts src/runner/test-runner.ts tests/integration/container.test.ts && git commit -m "Add session file copying for containers"`

### Phase 4: User Experience Improvements

**Step 28:** Add warning when both auth methods are present (and not using --prefer-session)
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/src/index.ts`
- **Changes:**
  - After calling `getAuthMethod()`, check if both API key and session file exist
  - If not using `--prefer-session`, print warning: "Warning: Both ANTHROPIC_API_KEY and Claude session found. Using API key (may incur charges). Use --prefer-session to use your subscription instead."

**Step 29:** Update help text to mention session auth
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/src/index.ts`
- **Changes:**
  - Update program description to mention "API key or Claude Max subscription"
  - Add `--prefer-session` option description: "Use Claude session instead of API key when both are available"
  - Add note about authentication priority in help text

**Step 30:** Write failing test for auth method display
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/tests/integration/cli.test.ts`
- **Test:** "displays authentication method in output"
  - Run CLI with session auth
  - Verify output contains "Authentication: Claude Session"
  - Run CLI with API key
  - Verify output contains "Authentication: API Key"

**Step 31:** Run test to verify it fails
- **Command:** `npm test tests/integration/cli.test.ts`

**Step 32:** Add authentication method display to CLI output
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/src/index.ts`
- **Changes:**
  - After getting auth method, print which auth source is being used
  - Include this in the startup banner

**Step 33:** Run tests and verify they pass
- **Command:** `npm test tests/integration/cli.test.ts`

**Step 34:** Commit UX improvements
- **Command:** `git add src/index.ts tests/integration/cli.test.ts && git commit -m "Add authentication method display and warnings"`

### Phase 5: Documentation

**Step 35:** Update README with session auth instructions
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/README.md`
- **Changes:**
  - Add section "Authentication Methods"
  - Document Claude Max subscription usage
  - Document `claude login` setup
  - Document priority order
  - Add troubleshooting section for auth issues

**Step 36:** Update environment variables section
- **File:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support/README.md`
- **Changes:**
  - Change "Required" to "Required (or Claude session)" for ANTHROPIC_API_KEY
  - Add note about `.claude.json` session file

**Step 37:** Commit documentation updates
- **Command:** `git add README.md && git commit -m "Document Claude Max authentication support"`

### Phase 6: Final Verification

**Step 38:** Run full test suite
- **Command:** `npm test`
- **Expected:** All tests pass (55+ tests)

**Step 39:** Run linter
- **Command:** `npm run lint`
- **Expected:** No linting errors

**Step 40:** Run build
- **Command:** `npm run build`
- **Expected:** Clean TypeScript compilation

**Step 41:** Manual test with mocked session file
- **Setup:** Create a mock `.claude.json` in `~/.claude/`
- **Command:** `node dist/index.js ./tests --dry-run` (with API key unset)
- **Expected:** CLI detects session and shows "Authentication: Claude Session"

**Step 42:** Manual test with API key
- **Setup:** Set `ANTHROPIC_API_KEY` environment variable
- **Command:** `node dist/index.js ./tests --dry-run`
- **Expected:** CLI uses API key and shows warning if session also exists

---

## Edge Cases

1. **Session file exists but is malformed/invalid JSON**
   - Detection: Add JSON parsing with try/catch in `findClaudeSessionFile()`
   - Behavior: Treat as if no session file exists, fall back to API key
   - Error message: "Warning: Found .claude.json but it's invalid. Using API key."

2. **Session file exists but has expired token**
   - Detection: Not possible to validate without making API call
   - Behavior: Let Claude CLI handle token refresh
   - Note: Document that users should run `claude login` if tests fail with auth errors

3. **User has multiple Claude accounts/session files**
   - Behavior: Use the priority order (global ~/.claude > local)
   - Documentation: Explain how to switch accounts using `claude logout && claude login`

4. **Running in CI/CD without home directory**
   - Detection: `os.homedir()` might throw or return undefined
   - Behavior: Gracefully handle missing home directory, only check local `.claude.json`
   - Fallback: Require API key in CI environments

5. **Container user UID mismatch with host**
   - Issue: `.claude.json` might not be readable in container due to permissions
   - Solution: Copy file into container instead of bind mount, set appropriate permissions
   - Alternative: Run container with same UID as host user

6. **Windows path handling for session file**
   - Issue: Windows uses different path separators and home directory structure
   - Solution: Use `path.join()` and `os.homedir()` which are cross-platform
   - Test: Ensure tests pass on Windows (though Docker requirement limits Windows support)

7. **No authentication available and non-TTY environment**
   - Detection: `!process.stdin.isTTY` and no auth sources
   - Behavior: Fail immediately with clear error message
   - Error: "No authentication found. Set ANTHROPIC_API_KEY or run 'claude login'."

## Questions

1. **Should we support ANTHROPIC_AUTH_TOKEN environment variable directly?**
   - Research shows this is used for proxy scenarios
   - Current plan: No, only support session file and API key
   - Rationale: Keep it simple, proxy scenarios are advanced usage

2. **Should we validate the session file format?**
   - Current plan: No validation, let Claude CLI handle it
   - Rationale: We don't know the exact format, and it might change
   - Risk: Could give confusing errors if file is malformed

3. **Should we warn users about API billing when API key is used?**
   - Current plan: Yes, warn when both auth methods exist
   - Additional consideration: Should we warn every time API key is used?
   - Leaning: Only warn when both exist, to avoid noise for API-key-only users

4. **How should we handle Docker-in-Docker scenarios?**
   - Current implementation already mounts host paths
   - Session file: Should work with current mount strategy
   - Question: Do we need special handling?
   - Decision needed: Test DinD scenario or document as unsupported

5. **Should we support custom session file paths via environment variable?**
   - Potential: `CLAUDE_SESSION_FILE=/custom/path/.claude.json`
   - Current plan: No
   - Rationale: Keep it simple, follow Claude CLI conventions
   - Reconsider: If users request this feature

---

## Testing Details

**Unit Tests** (`tests/unit/auth.test.ts` - new file, ~15 tests):
- Test `findClaudeSessionFile()` with various directory scenarios
- Test `getAuthMethod()` priority logic (API key > session > none)
- Test `getAuthConfig()` return values for different auth types
- Test error handling for malformed session files
- All tests use filesystem mocks to avoid requiring actual `.claude.json` files

**Integration Tests** (`tests/integration/cli.test.ts` - 3 new tests):
- Test CLI accepts session file authentication
- Test CLI prioritizes API key over session
- Test CLI displays correct authentication method in output
- Tests use temporary directories with mocked `.claude.json` files

**Integration Tests** (`tests/integration/container.test.ts` - 1 new test):
- Test container correctly mounts session file at `~/.claude/.claude.json`
- Verify file contents are accessible inside container
- Test uses real Docker containers to validate mount behavior

These tests specifically verify **authentication behavior**:
- Which auth source is detected and used
- How priority is resolved when multiple sources exist
- How auth credentials are passed to Docker containers
- How users are informed about which auth method is active

The tests do NOT:
- Mock auth detection and then test the mocks
- Test implementation details like data structures
- Test types or interfaces without actual behavior

---

## Implementation Details

1. **New module**: `src/utils/auth.ts` - Centralized authentication detection and configuration
2. **Priority order**: API key (env var) > Claude session file > none (error)
3. **Session file locations**: `~/.claude/.claude.json` (global) preferred over `./.claude.json` (local)
4. **Container mounting**: Session file mounted to `~/.claude/.claude.json` in container
5. **Backward compatibility**: Existing API-key-only workflows unchanged
6. **User warnings**: CLI warns when both auth methods exist (API key takes precedence)
7. **Authentication display**: Startup banner shows which auth method is active
8. **Error handling**: Clear errors when no auth is available
9. **Cross-platform**: Use `os.homedir()` and `path.join()` for Windows/Mac/Linux compatibility
10. **Testing strategy**: TDD approach with all tests written before implementation

---

## Questions

1. **Should we implement session token refresh logic?**
   - ✅ DECISION: No, rely on Claude CLI to handle token refresh. Document "run claude login again" in troubleshooting.

2. **How should we handle the case where session file exists but user wants to use API key?**
   - ✅ DECISION: API key takes precedence by default. Users can use `--prefer-session` to override. Users can also `claude logout` to remove session.

3. **Should we support reading session file from custom locations?**
   - ✅ DECISION: No, only check standard locations (`~/.claude/.claude.json` and `./.claude.json`). Reconsider if users report issues.

---
