# Task 08: Push registered origin to live backend stack

**Agent:** implementer
**Design:** docs/design/frontend-deploy.md

## Context

The frontend-deploy command registers the deployed Amplify
domain into `.boa/config.json` via `registerOrigin()`, but it
never pushes the change to the live CloudFormation stack. The
result: a user runs `boa deploy frontend`, the site goes live,
and the very first request to the API fails with
`No 'Access-Control-Allow-Origin' header` — exactly the bug
that triggered this whole feature.

This is the highest-priority follow-up. Without it, the
feature ships broken.

## Objective

After `registerOrigin()` writes the new origin to
`.boa/config.json`, run the existing backend deploy path so
the new `AllowedOrigins` value lands in API Gateway's CORS
config and S3's CORS rules.

The design (`docs/design/frontend-deploy.md` § "CORS allow-list
registration" and Open Question #2) requires that the origin
is registered *before* the frontend deploy lands, so by the
time the site is reachable, CORS is already open.

## Target Tests

Add to `cli/__tests__/deploy-frontend-command.test.mjs`:

1. **Backend stack is updated when a new origin is registered.**
   Setup: project with no `frontend.amplifyAppId` and an empty
   `allowedOrigins`. Stub the AWS CLI fake to record
   `cloudformation update-stack` (or `create-stack`) calls.
   Run `deployFrontend(['./web'])`. Assert that:
   - The fake AWS CLI was invoked with
     `cloudformation update-stack` (or `create-stack`) at least
     once.
   - The `--parameters file://...` argument's referenced JSON
     file contains the new Amplify origin under
     `AllowedOrigins`.
   - The backend update happens *before* `start-deployment`
     (the Amplify deploy upload). Use the call log order to
     verify.

2. **No backend update on subsequent deploys with no origin
   change.** Setup: project where `cfg.frontend.amplifyAppId`
   already exists and `allowedOrigins` already includes the
   Amplify domain. Run `deployFrontend(['./web'])`. Assert that
   the AWS CLI fake recorded zero `cloudformation update-stack`
   calls. (Idempotency.)

3. **Backend update failure aborts the deploy before Amplify
   upload.** Setup: configure the AWS CLI fake to fail on
   `cloudformation update-stack`. Run `deployFrontend(['./web'])`.
   Assert that:
   - The command exits non-zero.
   - `start-deployment` was never called.
   - `.boa/config.json` was rolled back: the new origin is
     either not present, or the file matches its pre-deploy
     state.

## Implementation

### `cli/commands/deploy-frontend.mjs`

After the existing `registerOrigin(origin)` call (currently
around line 160), and *before* `zipDir` + `startDeployment`
(currently lines 165–171), invoke the backend update.

Reuse the inline parameter-assembly pattern from
`cli/commands/deploy.mjs:175–185`:

```js
import * as deployLib from '../lib/deploy.mjs';
import { resolveTemplate } from '../lib/extensions.mjs';

// after registerOrigin(origin)
const updatedCfg = config.read();   // re-read after registerOrigin wrote it
const needsBackendUpdate = isFirstDeploy
  || (expectedOrigin && expectedOrigin !== origin)
  || /* origin newly added */;

if (needsBackendUpdate) {
  const templatePath = resolveTemplate(process.cwd());
  const { lambdaKey, accountId } = deployLib.packageArtifacts({
    projectDir: process.cwd(),
    templatePath,
    region,
    stackName,
  });
  const templateUrl = deployLib.uploadTemplate({
    templatePath,
    bucket: deployLib.artifactsBucketName(accountId, region),
    region,
    stackName,
  });
  const parameters = {
    ProjectName: stackName,
    LambdaS3Bucket: deployLib.artifactsBucketName(accountId, region),
    LambdaS3Key: lambdaKey,
    AllowedOrigins: updatedCfg.allowedOrigins.join(','),
  };
  if (updatedCfg.certificateArn) {
    parameters.CertificateArn = updatedCfg.certificateArn;
  }
  await deployLib.deployStack({
    stackName, region, templateUrl, parameters,
  });
  ok('Updating backend CORS allow-list... done');
}
```

The call to `deployStack` is idempotent — CFN's "No updates are
to be performed" no-op is already swallowed inside `deployStack`.

### Optimization (optional, in scope)

Re-packaging Lambda artifacts for a CORS-only change is wasteful
on a first frontend deploy that follows a fresh backend deploy.
If `cfg.lambdaS3Key` is already populated (set by a recent
backend deploy), reuse it instead of re-running `packageArtifacts`.
Look at how `cli/commands/deploy.mjs` populates this — if the
config persists `lambdaS3Key`, reuse; if not, re-package.

If unclear, just always re-package. Correctness over speed for
the first version.

### Rollback on failure

If `deployStack` throws, revert the change to `.boa/config.json`:

```js
const originalOrigins = [...cfg.allowedOrigins || []];
try {
  registerOrigin(origin);
  await deployStack({ /* ... */ });
} catch (err) {
  const reverted = config.read();
  reverted.allowedOrigins = originalOrigins;
  config.write(reverted);
  throw err;
}
```

This keeps the local config consistent with the live stack
state. If the user retries, they'll go through the same path
again instead of skipping the backend update because the local
config "already has" the origin.

## Acceptance Criteria

- All three new tests in
  `cli/__tests__/deploy-frontend-command.test.mjs` pass.
- All existing tests still pass.
- The order of operations on a fresh deploy is: build → scan →
  source-map check → write runtime config + headers → create or
  reuse Amplify app → register origin → **update backend
  stack** → zip → start Amplify deployment → wait → finalize.
- The backend update step is logged with a clear status line
  (`ok('Updating backend CORS allow-list... done')` or similar).
- No regression to the existing `boa deploy` (backend-only)
  flow: `cli/__tests__/deploy-migration.test.mjs` and
  `deploy-params.test.mjs` keep passing.

## Conflict Criteria

- If the test fakes for AWS CLI in
  `deploy-frontend-command.test.mjs` need significant new
  cases for `cloudformation` calls, extend the fake rather than
  escalating.
- If `packageArtifacts` requires a fully-rebuilt `dist/` with
  pgrest-lambda installed and that's not in the test fixture,
  factor the parameter-assembly into a separate function
  (`assembleBackendParameters(cfg)`) that the test can call
  directly without going through the Lambda packaging.
- If the rollback approach interferes with the existing
  test that asserts `cfg.frontend.amplifyAppId` is written,
  apply rollback only to `allowedOrigins` (not the full config),
  as written above.
