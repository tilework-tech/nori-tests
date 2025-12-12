# Claude Max Authentication Support - Progress Report

**Branch:** `feat/claude-max-auth-support`
**Working Directory:** `/home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support`
**Status:** In Progress - Core utilities complete, integration pending

---

## Objective

Enable nori-tests to support Claude Max subscription-based authentication in addition to ANTHROPIC_API_KEY, allowing users with Claude Pro/Max plans to run tests without needing separate API keys.

---

## Key Decisions Made

1. **Session token validation**: Pass through to Claude CLI (no validation in nori-tests)
2. **Authentication priority**: Add `--prefer-session` flag to allow users to override default API key priority
3. **Session file handling**: Copy file into container (more reliable than bind mounting)

---

## Work Completed ✅

### 1. Environment Setup
- ✅ Created worktree at `.worktrees/feat/claude-max-auth-support`
- ✅ Installed dependencies (`npm install`)
- ✅ Verified baseline tests pass (55 tests, all passing)
- ✅ Built project successfully

### 2. Research & Planning
- ✅ Researched Claude Max authentication mechanisms using `nori-knowledge-researcher`
- ✅ Key findings:
  - Claude Max uses session-based auth via `.claude.json` file
  - Session files stored in `~/.claude/.claude.json` or `./.claude.json`
  - API key takes precedence by default in Claude CLI
  - Session files should be copied into containers, not mounted
- ✅ Created comprehensive implementation plan (`IMPLEMENTATION_PLAN.md`)
- ✅ Updated plan with user decisions

### 3. Authentication Utilities (TDD Implementation)
- ✅ Created `/src/utils/auth.ts` with full type definitions:
  - `AuthMethod` type (api-key | session | none)
  - `AuthConfig` interface
- ✅ Implemented `findClaudeSessionFile()`:
  - Checks `~/.claude/.claude.json` first (global)
  - Checks `./.claude.json` second (local)
  - Returns path or null
- ✅ Implemented `getAuthMethod(preferSession?: boolean)`:
  - Detects API key from `ANTHROPIC_API_KEY` env var
  - Detects session file using `findClaudeSessionFile()`
  - Respects `preferSession` flag to override priority
  - Returns `hasBoth` flag when both sources exist
  - Default priority: API key > session > none
- ✅ Implemented `getAuthConfig(preferSession?: boolean)`:
  - Returns environment variables for container
  - Returns session file path to copy
  - Throws error when no auth available
- ✅ Created comprehensive test suite (`tests/unit/auth.test.ts`):
  - 14 unit tests covering all scenarios
  - Tests use temp directories and proper env var cleanup
  - All tests passing
- ✅ Full test suite passing (69 tests total: 55 existing + 14 new)
- ✅ Committed changes:
  ```
  feat: Add authentication detection utilities
  - Add findClaudeSessionFile() to locate .claude.json in standard locations
  - Add getAuthMethod() to detect API key vs session authentication with priority logic
  - Add getAuthConfig() to generate container-ready auth configuration
  - Support --prefer-session flag for prioritizing session over API key
  - Include hasBoth flag when multiple auth sources are present
  - All functions fully tested with 14 unit tests
  ```

---

## Work Remaining 🚧

### Phase 1: CLI Integration (TDD)

**File to modify:** `src/index.ts`

**Tasks:**
1. Add `--prefer-session` option to program:
   ```typescript
   .option('--prefer-session', 'Use Claude session instead of API key when both are available')
   ```

2. Import auth utilities:
   ```typescript
   import { getAuthMethod, type AuthMethod } from './utils/auth.js';
   ```

3. Replace `getApiKey()` logic with `getAuthMethod()`:
   ```typescript
   // Current code around line 61-78
   let apiKey = getApiKey();

   // New code:
   const authMethod = getAuthMethod(options.preferSession);

   if (authMethod.type === 'none' && !options.dryRun) {
     // Handle prompting or error
   }
   ```

4. Add warning when both auth methods exist and not using --prefer-session:
   ```typescript
   if (authMethod.type === 'api-key' && authMethod.hasBoth && !options.preferSession) {
     console.warn('⚠️  Warning: Both ANTHROPIC_API_KEY and Claude session found.');
     console.warn('   Using API key (may incur charges).');
     console.warn('   Use --prefer-session to use your subscription instead.\n');
   }
   ```

5. Display authentication method in startup banner:
   ```typescript
   console.log(`Authentication: ${
     authMethod.type === 'api-key' ? 'API Key' :
     authMethod.type === 'session' ? 'Claude Session' :
     'None (dry-run)'
   }`);
   ```

6. Pass auth method to `runTests()`:
   ```typescript
   const report = await runTests(folderPath, {
     authMethod,  // instead of apiKey
     outputFile: options.output,
     keepContainers: options.keepContainers,
     dryRun: options.dryRun,
     stream: options.stream,
     onOutput: ...
   });
   ```

**Tests to add** (`tests/integration/cli.test.ts`):
- Test CLI with only session file (no API key)
- Test CLI with --prefer-session flag
- Test warning appears when both auth methods exist
- Test authentication method display in output

### Phase 2: Test Runner Integration (TDD)

**File to modify:** `src/runner/test-runner.ts`

**Tasks:**
1. Import auth utilities:
   ```typescript
   import { getAuthConfig, type AuthMethod } from '../utils/auth.js';
   ```

2. Update `TestRunnerOptions` interface (line 17-21):
   ```typescript
   export interface TestRunnerOptions extends RunOptions {
     authMethod: AuthMethod;  // Replace apiKey: string
     dryRun?: boolean;
     onOutput?: (chunk: StreamChunk) => void;
   }
   ```

3. Update `runSingleTest` to use auth config (around line 148):
   ```typescript
   // Get auth config from auth method
   const authConfig = getAuthConfig(options.authMethod.type === 'session');

   const containerOptions = {
     workDir,
     mounts: [{ hostPath: workDir, containerPath: workDir }],
     env: authConfig.env,  // Use auth config env vars
     sessionFileToCopy: authConfig.sessionFileToCopy,  // Add this new option
     keepContainer: options.keepContainers,
     containerName: options.keepContainers
       ? `nori-test-${path.basename(testFile, '.md')}-${Date.now()}`
       : undefined,
   };
   ```

### Phase 3: Container Manager Integration (TDD)

**File to modify:** `src/docker/container.ts`

**Tasks:**
1. Add `sessionFileToCopy` to container options interface
2. Before running command, if `sessionFileToCopy` is provided:
   ```typescript
   if (options.sessionFileToCopy) {
     // Read session file from host
     const sessionContent = fs.readFileSync(options.sessionFileToCopy, 'utf-8');

     // Create .claude directory in container
     await container.exec({
       Cmd: ['mkdir', '-p', '/root/.claude'],
       AttachStdout: true,
       AttachStderr: true,
     });

     // Write session file to container
     // Use putArchive or exec with heredoc to write file
     // Target: /root/.claude/.claude.json
   }
   ```

**Tests to add** (`tests/integration/container.test.ts`):
- Test copying session file into container
- Test file exists at `/root/.claude/.claude.json` in container
- Test file contents match host file

### Phase 4: Documentation Updates

**File to modify:** `README.md`

**Sections to add/update:**

1. Update usage section to show --prefer-session:
   ```markdown
   ### Options

   - `-o, --output <file>` - Output JSON report to file
   - `--keep-containers` - Keep containers after tests for debugging
   - `--dry-run` - Discover tests without running them
   - `--prefer-session` - Use Claude session instead of API key when both are available
   - `-V, --version` - Output version number
   - `-h, --help` - Display help
   ```

2. Add "Authentication Methods" section:
   ```markdown
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

   By default, if both an API key and Claude session are available, the API key takes precedence. This prevents unexpected API charges.

   To prefer your Claude subscription when both are available:

   ```bash
   nori-tests ./tests --prefer-session
   ```

   ### Authentication Status

   nori-tests will display which authentication method is being used:

   ```
   nori-tests v1.0.0
   ================
   Authentication: Claude Session
   Test folder: ./tests
   Tests found: 5
   ```
   ```

3. Update Environment Variables section:
   ```markdown
   ## Environment Variables

   - `ANTHROPIC_API_KEY` - Your Anthropic API key (optional if using Claude session)
   ```

4. Add Troubleshooting section:
   ```markdown
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
   ```

### Phase 5: Final Testing & Cleanup

**Tasks:**
1. Run full test suite: `npm test`
   - Expected: All tests pass (should be 70+ tests)

2. Run linter: `npm run lint`
   - Expected: No errors

3. Run build: `npm run build`
   - Expected: Clean TypeScript compilation

4. Manual testing:
   - Test with API key only
   - Test with session file only (mock .claude.json)
   - Test with both (verify warning appears)
   - Test with --prefer-session flag

5. Update `src/docs.md` if it exists with new authentication behavior

6. Use `updating-noridocs` skill to sync documentation

7. Use `finishing-a-development-branch` skill to:
   - Run final checks
   - Create pull request
   - Ensure CI passes

---

## Implementation Notes

### Key Files Changed
- ✅ `src/utils/auth.ts` - New authentication utilities
- ✅ `tests/unit/auth.test.ts` - New test file (14 tests)
- 🚧 `src/index.ts` - CLI integration pending
- 🚧 `src/runner/test-runner.ts` - Test runner integration pending
- 🚧 `src/docker/container.ts` - Container integration pending
- 🚧 `tests/integration/cli.test.ts` - Additional tests pending
- 🚧 `tests/integration/container.test.ts` - Additional tests pending
- 🚧 `README.md` - Documentation updates pending

### Test Coverage
- Current: 69 tests passing
- Expected final: ~75-80 tests (adding ~6-10 integration tests)

### Edge Cases Handled
1. ✅ API key present, no session file
2. ✅ Session file present, no API key
3. ✅ Both present (API key default priority)
4. ✅ Both present with --prefer-session flag
5. ✅ Neither present (error handling)
6. ✅ Session file detection priority (global > local)
7. 🚧 Session file copied into container
8. 🚧 Warning displayed when both exist
9. 🚧 Authentication method displayed to user

### Session File Locations
- Global: `~/.claude/.claude.json` (preferred)
- Local: `./.claude.json` (fallback)

### Container Session File Path
- Target location: `/root/.claude/.claude.json`
- Must create `/root/.claude` directory first

---

## Commands Reference

### Development
```bash
# Switch to worktree
cd /home/amol/code/nori/nori-tests/.worktrees/feat/claude-max-auth-support

# Run tests
npm test

# Run specific test file
npm test tests/unit/auth.test.ts

# Run linter
npm run lint

# Build
npm run build
```

### Testing Authentication Locally
```bash
# Test with API key only
export ANTHROPIC_API_KEY=sk-test-key
unset CLAUDE_SESSION  # if exists
npm test

# Test with session file (mock)
mkdir -p ~/.claude
echo '{"session":"test"}' > ~/.claude/.claude.json
unset ANTHROPIC_API_KEY
npm test

# Test with both
export ANTHROPIC_API_KEY=sk-test-key
echo '{"session":"test"}' > ~/.claude/.claude.json
npm test  # Should see warning

# Test --prefer-session
npm test -- --prefer-session
```

### Git Commands
```bash
# Check status
git status

# Stage changes
git add <files>

# Commit
git commit -m "message"

# View commits
git log --oneline

# Return to main
cd /home/amol/code/nori/nori-tests
git worktree list
```

---

## Next Steps (In Order)

1. **CLI Integration** (~30 min)
   - Modify `src/index.ts`
   - Add `--prefer-session` flag
   - Add warning logic
   - Add auth method display
   - Write tests for new CLI behavior

2. **Test Runner Integration** (~20 min)
   - Modify `src/runner/test-runner.ts`
   - Update interface to use `authMethod` instead of `apiKey`
   - Pass auth config to container options

3. **Container Integration** (~30 min)
   - Modify `src/docker/container.ts`
   - Implement session file copying logic
   - Write tests for container file copying

4. **Documentation** (~20 min)
   - Update `README.md` with authentication methods
   - Add troubleshooting section
   - Update environment variables section

5. **Final Testing** (~15 min)
   - Run full test suite
   - Run linter
   - Build project
   - Manual testing with different auth scenarios

6. **Create PR** (~10 min)
   - Use `finishing-a-development-branch` skill
   - Ensure all tests pass
   - Create pull request with comprehensive summary

**Estimated Total Time Remaining:** ~2 hours

---

## Questions/Decisions Log

1. **Q:** Should we validate the .claude.json file format?
   **A:** No, pass through to Claude CLI

2. **Q:** API key precedence warning - when to show?
   **A:** Add `--prefer-session` flag for override

3. **Q:** Session file copying vs mounting?
   **A:** Copy into container (more reliable)

---

## Context & Resources

- **Research findings:** See nori-knowledge-researcher output in conversation
- **Implementation plan:** `IMPLEMENTATION_PLAN.md`
- **Key insight:** Claude Max users authenticate via `claude login`, not API keys
- **Session format:** JSON file, exact format not validated by nori-tests
- **Container target:** Session file goes to `/root/.claude/.claude.json` in container

---

## Success Criteria

- ✅ All existing tests still pass
- 🚧 New authentication tests pass
- 🚧 CLI accepts `--prefer-session` flag
- 🚧 Session files are detected and used
- 🚧 Session files are copied into containers correctly
- 🚧 Warning displays when both auth methods exist
- 🚧 Authentication method is clearly displayed to user
- 🚧 Documentation is updated and clear
- 🚧 Linter passes
- 🚧 Build succeeds
- 🚧 Manual testing confirms both auth methods work

---

**Last Updated:** 2025-12-12 12:05 PM
**Commits Made:** 1 (auth utilities)
**Current Branch:** feat/claude-max-auth-support
**Tests Passing:** 69/69
