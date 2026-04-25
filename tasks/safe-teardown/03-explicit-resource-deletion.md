# Task 03: Explicit Resource Deletion

**Agent:** implementer
**Design:** docs/design/safe-teardown.md

## Objective

After `sam.remove()` deletes the CloudFormation stack,
explicitly delete the three retained resources (DSQL
cluster, Cognito user pool, S3 bucket) that survive
stack deletion due to `DeletionPolicy: Retain`.

## Target Tests

This task has no dedicated E2E tests in Task 01 because
the deletion steps require live AWS resources. The
correctness is verified by the post-teardown verification
(Task 04) and manual validation.

## Implementation

**File:** `cli/commands/teardown.mjs`

### Import `fail`

Add `fail` to the existing import from `../lib/output.mjs`
(currently only imports `ok` at line 8):

```javascript
import { ok, fail } from '../lib/output.mjs';
```

### Add deletion steps after `sam.remove()`

Insert three deletion blocks after the current step 10
(`sam.remove()` at line 147) and before the SSM cleanup
(current line 151). Each deletion is independent -- if
one fails, the others still run.

Note: `dsqlClusterId` is already computed at line 110
(`dsqlEndpoint.split('.')[0]`). It is available in scope.

```javascript
console.log('');
console.log('Deleting retained resources...');

// Delete DSQL cluster
try {
  aws.exec(
    `aws dsql delete-cluster`
      + ` --identifier ${shellEscape(dsqlClusterId)}`
      + ` --region ${shellEscape(region)}`
  );
  ok(`DSQL cluster '${dsqlClusterId}' delete initiated`);
} catch (e) {
  if (e.message?.includes('ResourceNotFoundException')) {
    ok(`DSQL cluster '${dsqlClusterId}' already gone`);
  } else {
    fail(`DSQL cluster '${dsqlClusterId}' delete failed:`
      + ` ${e.message}`);
  }
}

// Delete Cognito user pool
try {
  aws.exec(
    `aws cognito-idp delete-user-pool`
      + ` --user-pool-id ${shellEscape(userPoolId)}`
      + ` --region ${shellEscape(region)}`
  );
  ok(`Cognito user pool '${userPoolId}' deleted`);
} catch (e) {
  if (e.message?.includes('ResourceNotFoundException')) {
    ok(`Cognito user pool '${userPoolId}' already gone`);
  } else {
    fail(`Cognito user pool '${userPoolId}' delete failed:`
      + ` ${e.message}`);
  }
}

// Delete S3 bucket
try {
  aws.exec(
    `aws s3api delete-bucket`
      + ` --bucket ${shellEscape(bucketName)}`
      + ` --region ${shellEscape(region)}`
  );
  ok(`S3 bucket '${bucketName}' deleted`);
} catch (e) {
  if (e.message?.includes('NoSuchBucket')
      || e.message?.includes('not found')) {
    ok(`S3 bucket '${bucketName}' already gone`);
  } else {
    fail(`S3 bucket '${bucketName}' delete failed:`
      + ` ${e.message}`);
  }
}
```

### Error semantics

- DSQL `delete-cluster` returns
  `ResourceNotFoundException` (404) if gone,
  `ConflictException` (409) if deletion protection is
  still enabled.
- Cognito `delete-user-pool` returns
  `ResourceNotFoundException` if gone,
  `InvalidParameterException` if deletion protection
  is still active.
- S3 `delete-bucket` returns `NoSuchBucket` if gone,
  `BucketNotEmpty` if non-empty.

Each "already gone" case is treated as success. All other
errors are reported via `fail()` but do not halt the
remaining deletions.

## Acceptance Criteria

- `cli/commands/teardown.mjs` compiles without errors
- Existing tests in `cli/__tests__/cli.test.mjs` and
  `cli/__tests__/teardown.test.mjs` still pass
- The `fail` function is imported alongside `ok`
- Each resource deletion is wrapped in its own try/catch
- Already-deleted resources are handled gracefully

## Conflict Criteria

If `teardown.mjs` already contains `delete-cluster`,
`delete-user-pool`, or `delete-bucket` calls, investigate
whether this task has already been implemented. Escalate
if the existing implementation differs from the design.
