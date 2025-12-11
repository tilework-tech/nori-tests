# CLI Integration Test

This test validates the full nori-tests CLI workflow.

## Steps

### 1. Build the package

Run the build command:

```bash
cd /workspace && npm run build
```

Verify that `dist/index.js` exists after the build.

### 2. Run nori-tests on fixtures with --keep-containers

Run the CLI against the fixtures folder which contains two tests:
- `should-pass.md` - designed to pass
- `should-fail.md` - designed to fail

```bash
cd /workspace && node dist/index.js nori-tests/fixtures --keep-containers --output /workspace/test-report.json
```

### 3. Verify the output

Read `/workspace/test-report.json` and verify:
- `totalTests` equals 2
- `passed` equals 1
- `failed` equals 1
- `results` array has 2 entries
- One result has `status: "success"` for `should-pass.md`
- One result has `status: "failure"` for `should-fail.md`

### 4. Verify containers are still running

Run `docker ps -a` and verify there are containers with names containing `nori-test-should-pass` and `nori-test-should-fail`.

Check the logs of the kept containers to verify they ran claude-code:
```bash
docker logs <container-name>
```

The logs should contain evidence of claude-code execution.

## Success Criteria

If all verifications pass:
- Build succeeded
- Test report shows 1 pass, 1 fail
- Containers were kept (not auto-removed)
- Container logs show execution

Then write the success status.

If any verification fails, write the failure status with details about what failed.

## Cleanup

After writing the status file, clean up the kept containers:
```bash
docker rm -f $(docker ps -a --filter "name=nori-test-should" -q) 2>/dev/null || true
```
