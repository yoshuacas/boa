# Task 11: Shell-escape zip path; correct test-fixture response shapes

**Agent:** implementer
**Design:** docs/design/frontend-deploy.md (post-implementation cleanup)

## Context

Two cleanup items surfaced during the post-loop audit of the
frontend-deploy feature. Neither breaks the current behavior,
but both should land before the PR is reviewed.

### 1. Unescaped path in `zipDir`

`cli/commands/deploy-frontend.mjs:48-52`:

```js
function zipDir(dir) {
  const zipPath = join(dir, '..', 'boa-deploy.zip');
  execSync(`zip -r -q ${zipPath} .`, { cwd: dir });
  return zipPath;
}
```

`zipPath` is interpolated raw into the shell command. In
practice it's derived from `tmpdir()`-style paths so the
exposure is small, but the rest of `cli/lib/aws.mjs` and
`cli/lib/amplify.mjs` consistently route every path through
`shellEscape()`. The inconsistency is a footgun for the next
edit and a code-review smell.

A user with a project path containing spaces, backticks, or
shell metacharacters is the realistic trigger. The dist
directory inherits the user's project layout, so a path like
`~/research/my project/web/dist` is enough to break the zip.

### 2. Test fixture returns the wrong shape for `start-deployment`

`cli/__tests__/deploy-frontend-command.test.mjs:66-68` and
`cli/__tests__/frontend-amplify.test.mjs:38-39` both fake:

```sh
*start-deployment*)
  echo '{"jobSummary":{"status":"PENDING"}}'
```

Production code (`cli/lib/amplify.mjs:49-51`) calls
`runJson(...)` for `start-deployment` but discards the parsed
result — the only consumer is `waitForDeployment`, which
polls `get-job` separately. So the wrong shape doesn't
break any test today.

It will break the *next* test that wants to assert anything
about the `start-deployment` response (for example: read the
returned job ID and re-use it in `waitForDeployment`, or
verify a `summary` field). The next person extending the
tests should not have to re-discover that the fixture lies.

The actual `aws amplify start-deployment` API returns:
```json
{
  "jobSummary": {
    "jobId": "...",
    "status": "PENDING",
    "jobType": "RELEASE",
    "startTime": "..."
  }
}
```

The fixture has only `jobSummary.status`. Easy fix.

## Objective

1. Replace the raw interpolation in `zipDir` with
   `shellEscape()`, matching the rest of the CLI.
2. Update both test fixtures so `start-deployment` returns a
   shape that matches the real AWS CLI response (full
   `jobSummary` with `jobId`, `status`, `startTime`).
3. Add a regression test that catches the unescaped-zip-path
   case so future edits don't regress.

## Target Tests

### Add to `cli/__tests__/deploy-frontend-command.test.mjs`

**Test: dist path with spaces is handled correctly.** Setup a
project with a frontend at a tmp path that includes a space
character (e.g., create the tmp dir under
`mkdtempSync(join(tmpdir(), 'boa fe '))` so the inner
`web` is at a path like `/tmp/boa fe abc/web`). The fake
`zip` script should record its arguments to the call log; the
test asserts that the path argument is properly quoted (the
recorded line should contain the original path, not a
truncated version split at the space).

The fake `zip` already exists; extend it to log argument
positions:

```sh
fakeZip="#!/bin/sh
echo \"zip arg1=\$1 arg2=\$2 arg3=\$3 arg4=\$4 arg5=\$5\" >> \"${callLog}\"
touch \"\$3\"
"
```

The test inspects the call log: `arg3` must be the full
quoted zip path (e.g., `/tmp/boa fe abc/web/../boa-deploy.zip`),
not the truncated form (`/tmp/boa`).

If the existing fake doesn't make argument-by-argument
inspection easy, just assert that the deploy command
completes without error when the path contains a space —
that alone is a regression check (the unescaped version
fails before this fix).

### Update existing fixtures (no new test, just the shape fix)

In `cli/__tests__/deploy-frontend-command.test.mjs:66-68`
and `cli/__tests__/frontend-amplify.test.mjs:38-39`, replace
the `start-deployment` echo with the realistic shape:

```sh
*start-deployment*)
  echo '{"jobSummary":{"jobId":"job-99","status":"PENDING","jobType":"RELEASE","startTime":"2026-01-01T00:00:00Z"}}'
  ;;
```

All existing tests should keep passing — production code
doesn't read the response, and any test that does will now
see the realistic shape.

## Implementation

### `cli/commands/deploy-frontend.mjs`

```js
import { shellEscape } from '../lib/aws.mjs';

function zipDir(dir) {
  const zipPath = join(dir, '..', 'boa-deploy.zip');
  execSync(`zip -r -q ${shellEscape(zipPath)} .`, { cwd: dir });
  return zipPath;
}
```

`shellEscape` is already in scope via `aws.mjs`; the
existing import path `import { shellEscape } from '../lib/aws.mjs'`
mirrors how `cli/lib/amplify.mjs` brings it in.

### `cli/__tests__/deploy-frontend-command.test.mjs`

- Update the `start-deployment` case in the fake AWS CLI to
  the realistic shape (above).
- Add the new "dist path with spaces" test case.

### `cli/__tests__/frontend-amplify.test.mjs`

- Update the `start-deployment` case in the fake AWS CLI to
  the realistic shape.

## Acceptance Criteria

- `cli/commands/deploy-frontend.mjs` no longer has any
  unescaped path interpolation in shell commands.
- Both test fixtures return a `jobSummary` with `jobId`,
  `status`, `jobType`, and `startTime` for `start-deployment`.
- New regression test passes: a deploy with a space in the
  dist path completes without zip errors.
- All 299 existing tests still pass.
- No grep hit for ``execSync(`...${...}...`)`` in
  `cli/commands/deploy-frontend.mjs` where the interpolated
  value is a path or user-controllable string.

## Conflict Criteria

- If `shellEscape` doesn't exist in `cli/lib/aws.mjs` (verify
  before editing), check `cli/lib/amplify.mjs` for the actual
  source, and import from there.
- If the spaces-in-path test reveals a *separate* bug in
  another part of the deploy flow (not the zip step), document
  it as a follow-up rather than expanding the scope of this
  task. The goal is the shellEscape fix and the fixture
  shape correction; broader hardening is out of scope.
- If updating the test fixture shape reveals an existing test
  that was relying on the *wrong* shape (i.e., would now fail
  because it asserted on the absence of `jobId`), that test is
  a false positive — fix the assertion to match the new
  realistic shape.
