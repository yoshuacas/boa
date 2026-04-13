# Task 11: teardown Command

**Agent:** implementer
**Design:** docs/design/boa-cli.md
**Depends on:** Task 03, Task 05

## Objective

Implement `cli/commands/teardown.mjs`, porting
`plugin/scripts/teardown.sh` to Node.js. Destroys the
entire stack with interactive confirmation.

## Target Tests

No unit tests (this command is destructive and interactive).
Verified via manual integration testing.

## Implementation

Replace the stub in `cli/commands/teardown.mjs`. Port the
logic from `plugin/scripts/teardown.sh`:

1. Load config via `config.requireConfig()` with the
   specific error message for teardown:
   `Error: .boa/config.json not found. Nothing to tear down.`
   (Note: this differs from the generic requireConfig
   message. Override the behavior or check config manually
   with `config.read()` and print the teardown-specific
   message.)
2. Read `stackName`, `region`, `bucketName`, `userPoolId`,
   `dsqlEndpoint` from config.
3. Print destructive operation warning box matching the
   shell script's Unicode box format. List what will be
   destroyed: database, user accounts, files, Lambda
   functions, API endpoints.
4. Print stack details (name, region, database, users,
   storage).
5. Prompt for confirmation using `readline`:
   `Type the stack name to confirm deletion [<name>]: `
6. If input does not match stack name exactly, cancel:
   `Teardown cancelled. You typed '<input>' but the stack
   name is '<name>'.`
   Exit 0.
7. Disable DSQL deletion protection:
   Extract cluster ID from endpoint (first segment before
   first dot). Run:
   `aws dsql update-cluster --identifier <id>
   --no-deletion-protection-enabled --region <region>`
   Ignore errors (2>/dev/null equivalent: catch and
   continue).
8. Disable Cognito deletion protection:
   `aws cognito-idp update-user-pool --user-pool-id <id>
   --deletion-protection INACTIVE --region <region>`
   Ignore errors.
9. Empty S3 bucket:
   `aws s3 rm s3://<bucket> --recursive --region <region>`
   Ignore errors.
10. Delete stack via `sam.remove(stackName, region)`.
11. Clean up SSM parameters under `/<stackName>/`:
    Query parameters via `aws ssm get-parameters-by-path`,
    delete each one.
12. Remove `.boa/` directory via `fs.rmSync` with
    `{ recursive: true, force: true }`.
13. Print: `Teardown complete. Stack '<name>' has been
    destroyed.`

### Interactive confirmation

Use Node.js `readline` per the design:
```javascript
import { createInterface } from 'node:readline';

async function confirm(prompt) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
```

The command is intentionally interactive for safety. It
reads from stdin. This prevents accidental destruction by
scripts or agents.

## Acceptance Criteria

- `node cli/bin/boa.mjs teardown` in a directory without
  config prints the teardown-specific error and exits 1.
- Full teardown flow works against a deployed stack (manual
  integration test): wrong name cancels, correct name
  destroys.
- After teardown, `.boa/` directory is removed.
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
