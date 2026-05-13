# Fix: `boa deploy` mangles `cfg.allowedOrigins` when it has more than one entry

**Agent:** implementer
**Status:** open
**Severity:** high (blocks production deploys with multiple CORS origins)
**Filed by:** session pairing on the `cyclewaze` app, 2026-05-13
**Component:** `cli/lib/deploy.mjs` (CloudFormation parameter formatting)

---

## Reproduction

```bash
# .boa/config.json
{
  ...
  "allowedOrigins": [
    "http://localhost:5173",
    "https://prod.d2tdp0t0w0ur3n.amplifyapp.com"
  ]
}

boa deploy
```

Fails with:

```
aws: [ERROR]: An error occurred (ParamValidation): Parameter validation failed:
Invalid type for parameter Parameters[3].ParameterValue,
value: ['http://localhost:5173', 'https://prod.d2tdp0t0w0ur3n.amplifyapp.com'],
type: <class 'list'>, valid types: <class 'str'>
```

A single origin works. Two or more origins always fails.

## Root cause

`cli/commands/deploy.mjs:181` correctly joins the array into a comma-string:

```js
parameters.AllowedOrigins = cfg.allowedOrigins.join(',');
```

`cli/lib/deploy.mjs:465-471` then formats each parameter for the AWS CLI shorthand syntax:

```js
function formatParams(params) {
  const entries = Object.entries(params)
    .filter(([, v]) => v != null && v !== '');
  return entries.map(([k, v]) =>
    `ParameterKey=${k},ParameterValue=${shellEscape(String(v))}`
  ).join(' ');
}
```

The result is passed to `aws cloudformation create-stack/update-stack --parameters ...` as shell-shorthand. **The AWS CLI shorthand parser interprets unescaped commas inside a value as field separators**, even when single-quoted. So a `ParameterValue` of `'a,b,c'` is parsed as three separate parameter values, which CloudFormation rejects because `AllowedOrigins` (a `CommaDelimitedList` parameter) expects a single string that *it* will split.

`shellEscape()` only escapes shell metacharacters; it does not protect commas from the AWS CLI's own shorthand parser. That is by design — single-quoting prevents the shell from globbing/word-splitting, but the AWS CLI shorthand parser runs *inside* the value after the shell hands it over.

This is a known AWS CLI shorthand pitfall. The official escape hatch is to switch to JSON:

> If you need to pass a value that includes commas, use the JSON form of `--parameters` and pipe a file or string.

## Verification of the analysis

The other call sites (`ProjectName`, `LambdaS3Bucket`, `LambdaS3Key`, `CertificateArn`) all happen to be comma-free, which is why no one has hit this before. `AllowedOrigins` is the first multi-value parameter to flow through `formatParams`.

A round-trip test exists at `cli/__tests__/deploy-migration.test.mjs:166-192` that confirms the array survives `buildDeployConfig`, but no test covers the actual `formatParams` → AWS CLI step.

## Workaround we used

For the `cyclewaze` deploy, we patched the Lambda's env var directly without going through CloudFormation:

```bash
aws lambda get-function-configuration --function-name cyclewaze-api --region us-east-2 \
  --query 'Environment.Variables' --output json \
  | jq '. + {ALLOWED_ORIGINS: "http://localhost:5173,https://prod.d2tdp0t0w0ur3n.amplifyapp.com"}' \
  | jq '{Variables: .}' > /tmp/lambda-env.json

aws lambda update-function-configuration --function-name cyclewaze-api --region us-east-2 \
  --environment file:///tmp/lambda-env.json
```

This works but **drifts from CloudFormation** — the next `boa deploy` will revert `ALLOWED_ORIGINS` to whatever CFN computes from the stack parameter. The fix below makes that future deploy succeed.

## Fix

Switch `formatParams` from AWS CLI shorthand to JSON via a tempfile.

### Edit `cli/lib/deploy.mjs`

Replace the existing `formatParams` (lines ~465–471) and the place it's used in `deployStack` (lines ~480–494). The new shape:

```js
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Build a CloudFormation --parameters JSON file.
// Returns the path to the file. Caller is responsible for cleanup
// (or just let the OS reap /tmp).
function writeParamsFile(params) {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  const json = entries.map(([k, v]) => ({
    ParameterKey: k,
    ParameterValue: String(v),
  }));
  const path = join(tmpdir(), `boa-cfn-params-${Date.now()}-${process.pid}.json`);
  writeFileSync(path, JSON.stringify(json));
  return path;
}

export async function deployStack({ stackName, region, templateUrl, parameters, onEvent = null }) {
  await cleanupStalledStack(stackName, region);
  const exists = stackExists(stackName, region);
  const verb = exists ? 'update-stack' : 'create-stack';
  const paramsFile = writeParamsFile(parameters);

  try {
    exec(
      `aws cloudformation ${verb} --stack-name ${shellEscape(stackName)} ` +
      `--region ${shellEscape(region)} --template-url ${shellEscape(templateUrl)} ` +
      `--capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM ` +
      `--parameters file://${shellEscape(paramsFile).slice(1, -1)}`
      // (slice strips the surrounding single-quotes; file:// paths
      // generally don't need shell-quoting since tmpdir() is safe,
      // but adapt if your shellEscape contract differs.)
    );
  } catch (err) {
    // ... existing no-op handling unchanged
  }
}
```

Delete the now-unused `formatParams` function.

### Test

Add a unit test in `cli/__tests__/` that constructs a `parameters` object with a comma in a value and confirms the generated JSON file deserializes cleanly:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { writeParamsFile } from '../lib/deploy.mjs';

test('writeParamsFile preserves commas inside ParameterValue', () => {
  const file = writeParamsFile({
    ProjectName: 'cyclewaze',
    AllowedOrigins: 'http://localhost:5173,https://prod.example.com',
  });
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const allowed = parsed.find((p) => p.ParameterKey === 'AllowedOrigins');
  assert.equal(allowed.ParameterValue, 'http://localhost:5173,https://prod.example.com');
  assert.equal(parsed.length, 2);
});
```

Add an integration-shaped test that reuses the existing CFN mocks (search for `cli/__tests__/deploy-*.test.mjs`) and asserts the AWS CLI invocation contains `--parameters file://` rather than `ParameterKey=...`.

### Backfill the round-trip path

`cli/__tests__/deploy-migration.test.mjs` already verifies the array round-trips through `buildDeployConfig`. Add a sibling test that runs `deployStack` end-to-end with a mocked `exec` and confirms the allow-list reaches CloudFormation as a single CSV string.

## Acceptance criteria

- [ ] `boa deploy` succeeds for a project whose `.boa/config.json` has `allowedOrigins` with **two or more** entries.
- [ ] After deploy, `aws lambda get-function-configuration --function-name <stack>-api --query 'Environment.Variables.ALLOWED_ORIGINS'` returns the comma-joined list (no quoting artifacts, no truncation).
- [ ] Browser preflight (`OPTIONS /auth/v1/token`) from each listed origin returns `access-control-allow-origin: <that origin>`.
- [ ] All existing tests still pass.
- [ ] New unit test for `writeParamsFile` covers the comma case.
- [ ] No regression for projects that pass `allowedOrigins: []` or omit the field — the parameter is still skipped, and the `HasAllowedOrigins` CFN condition still evaluates to false.

## Out of scope (note for future work)

- The `boa-cli` skill at `cli/skill/docs/API-PATTERNS.md` and `plugin/docs/API-PATTERNS.md` mentions `ALLOWED_ORIGINS` but doesn't tell developers how to add a deployed origin (e.g., Amplify URL) after `boa init`. Add a short "Deploying frontends" section once this fix lands.
- The skill examples should also flag that the leading `localhost:5173` allow-list default is a *dev-only fallback*, not something the production Lambda should keep — the prod allow-list should be exactly the deployed frontend origin(s).

## Context that triggered the bug report

While shipping the `cyclewaze` mockup to AWS Amplify Hosting at
`https://prod.d2tdp0t0w0ur3n.amplifyapp.com`, sign-in failed with
`No 'Access-Control-Allow-Origin' header`. The investigation flow:

1. Confirmed CORS preflight from Amplify origin returned 200 but no `access-control-allow-origin` header.
2. Confirmed the same preflight from `http://localhost:5173` *did* echo the origin — so the Lambda's allow-list had `localhost:5173` and only that.
3. Found `cfg.allowedOrigins` plumbing in `cli/commands/deploy.mjs` and the `AllowedOrigins` CFN parameter in `cli/templates/backend.yaml`.
4. Added the Amplify origin to `.boa/config.json` and ran `boa deploy` — failed with the param-validation error above.
5. Identified the AWS CLI shorthand comma-split as the cause and patched the Lambda env directly.

The whole flow took ~25 minutes a developer shouldn't have to spend.
