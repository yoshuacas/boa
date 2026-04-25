# Task 04: Post-Teardown Verification

**Agent:** implementer
**Design:** docs/design/safe-teardown.md
**Depends on:** Task 03

## Objective

After all deletions and local cleanup, verify that each
retained resource is actually gone or in a deleting state.
Print manual remediation commands for any surviving
resource and exit with code 1 if verification fails.

## Target Tests

This task has no dedicated E2E tests in Task 01 because
verification requires live AWS resources. Correctness is
validated through manual testing against a live account.

## Implementation

**File:** `cli/commands/teardown.mjs`

### Add verification pass after `.boa/` removal

Insert the verification block after the `rmSync` call
that removes `.boa/` (current step 12) and before the
completion message (current step 13). The design specifies
that `.boa/` is cleaned up regardless of verification
outcome since the config has already been consumed.

```javascript
console.log('');
console.log('Verifying resource cleanup...');
let allClean = true;
const manualCommands = [];

// Verify DSQL cluster
try {
  const clusterJson = aws.exec(
    `aws dsql get-cluster`
      + ` --identifier ${shellEscape(dsqlClusterId)}`
      + ` --region ${shellEscape(region)}`
      + ` --output json`
  );
  const cluster = JSON.parse(clusterJson);
  if (cluster.status === 'DELETING'
      || cluster.status === 'DELETED') {
    ok(`DSQL cluster: ${cluster.status}`);
  } else {
    fail(`DSQL cluster still exists`
      + ` (status: ${cluster.status})`);
    allClean = false;
    manualCommands.push(
      `aws dsql delete-cluster`
        + ` --identifier ${dsqlClusterId}`
        + ` --region ${region}`
    );
  }
} catch {
  ok('DSQL cluster: gone');
}

// Verify Cognito user pool
try {
  aws.exec(
    `aws cognito-idp describe-user-pool`
      + ` --user-pool-id ${shellEscape(userPoolId)}`
      + ` --region ${shellEscape(region)}`
  );
  fail('Cognito user pool still exists');
  allClean = false;
  manualCommands.push(
    `aws cognito-idp delete-user-pool`
      + ` --user-pool-id ${userPoolId}`
      + ` --region ${region}`
  );
} catch {
  ok('Cognito user pool: gone');
}

// Verify S3 bucket
try {
  aws.exec(
    `aws s3api head-bucket`
      + ` --bucket ${shellEscape(bucketName)}`
      + ` --region ${shellEscape(region)}`
  );
  fail('S3 bucket still exists');
  allClean = false;
  manualCommands.push(
    `aws s3api delete-bucket`
      + ` --bucket ${bucketName}`
      + ` --region ${region}`
  );
} catch {
  ok('S3 bucket: gone');
}
```

### Print remediation commands if needed

After the three verification checks:

```javascript
if (!allClean) {
  console.log('');
  console.log(
    'WARNING: Some resources were not fully cleaned up.'
  );
  console.log('Run these commands manually to finish:');
  for (const cmd of manualCommands) {
    console.log(`  ${cmd}`);
  }
}
```

### Update exit logic

The existing completion message stays, but add a
conditional exit after it:

```javascript
console.log('');
console.log(
  `Teardown complete. Stack '${stackName}' has been`
    + ' destroyed.'
);

if (!allClean) {
  process.exit(1);
}
```

### DSQL status values

DSQL cluster statuses: CREATING, ACTIVE, IDLE, UPDATING,
DELETING, DELETED, FAILED. The verification accepts
DELETING and DELETED as success. A
`ResourceNotFoundException` in the catch block also
means success (cluster fully removed).

## Acceptance Criteria

- `cli/commands/teardown.mjs` compiles without errors
- Existing tests still pass
- The verification block runs after `.boa/` removal and
  before the completion message
- Each resource check is independent -- one failure does
  not skip the others
- Manual remediation commands are printed for each
  surviving resource
- Exit code is 1 when `allClean` is false, 0 otherwise

## Conflict Criteria

If `teardown.mjs` already contains `get-cluster`,
`describe-user-pool`, or `head-bucket` verification
calls, investigate whether this task has already been
implemented. Escalate if the existing implementation
differs from the design.
