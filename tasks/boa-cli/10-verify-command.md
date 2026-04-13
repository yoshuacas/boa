# Task 10: verify Command

**Agent:** implementer
**Design:** docs/design/boa-cli.md
**Depends on:** Task 03, Task 05

## Objective

Implement `cli/commands/verify.mjs`, porting
`plugin/scripts/verify.sh` to Node.js. Checks all stack
components are correctly configured.

## Target Tests

No unit tests (this command queries live AWS resources).
Verified via manual integration testing.

## Implementation

Replace the stub in `cli/commands/verify.mjs`. Port the
logic from `plugin/scripts/verify.sh`:

1. Load config via `config.requireConfig()`. Read
   `stackName`, `region`, `apiUrl`, `userPoolId`,
   `bucketName`.
2. Print header box with stack name and region.
3. Run four checks:

   **Check 1: Cognito self-signup**
   ```
   aws cognito-idp describe-user-pool
     --user-pool-id <id> --region <region>
     --query 'UserPool.AdminCreateUserConfig.AllowAdminCreateUserOnly'
     --output text
   ```
   Pass if result is "False".

   **Check 2: API Gateway returns 401/403**
   Use `aws.exec()` to run `curl -s -o /dev/null -w
   '%{http_code}' <apiUrl>/items`. Pass if 401 or 403.

   **Check 3: S3 bucket exists**
   `aws s3api head-bucket --bucket <bucket> --region
   <region>`. Pass if no error.

   **Check 4: S3 bucket private**
   ```
   aws s3api get-public-access-block --bucket <bucket>
     --region <region>
     --query 'PublicAccessBlockConfiguration.BlockPublicAcls'
     --output text
   ```
   Pass if result is "True".

4. For each check, print `[PASS]` or `[FAIL]` with the
   descriptive message matching the design's example.
5. Print summary: `Results: N/M checks passed`.
6. Exit 0 if all pass, exit 1 if any fail.

**Output format** (matches design example):
```
======================================
  BOA Verification
======================================

  Stack:  my-app
  Region: us-east-1

Checking Cognito configuration...
  [PASS] Cognito self-signup enabled (AllowAdminCreateUserOnly=false)
Checking API Gateway...
  [PASS] API returns 401 Unauthorized (not 500)
Checking S3 bucket...
  [PASS] S3 bucket exists
  [PASS] S3 bucket has Block Public Access enabled

======================================
  Results: 4/4 checks passed
  All checks passed
======================================
```

Use `lib/output.mjs` for `pass()`, `fail()`, `header()`.

## Acceptance Criteria

- `node cli/bin/boa.mjs verify` in a directory without
  config prints the config-not-found error and exits 1.
- Full verify flow works against a deployed stack (manual
  integration test), all 4 checks pass.
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
