# Safe Teardown

## Overview

`boa teardown` has two bugs discovered during end-to-end
validation on 2026-04-24. First, it reports success but
leaves the DSQL cluster, Cognito user pool, and S3 bucket
alive because those resources have `DeletionPolicy: Retain`
in the SAM template. Every init/teardown cycle accumulates
orphan clusters until the 20-cluster DSQL quota blocks new
deploys. Second, an autonomous coding agent can bypass the
confirmation prompt by piping the stack name through stdin,
making teardown effectively unguarded in agent workflows.

The fix adds explicit resource deletion after
`sam.remove()`, a post-teardown verification pass, a TTY
check that blocks non-interactive invocations, and a
harness-level deny rule in `.claude/settings.json`.

## Current CX / Concepts

### Current Teardown Flow

`cli/commands/teardown.mjs` runs 13 steps:

1. Load `.boa/config.json`
2. Read config values (stackName, region, bucketName,
   userPoolId, dsqlEndpoint)
3. Print destructive-operation warning box
4. Print stack details
5. Prompt: "Type the stack name to confirm deletion"
6. Verify confirmation matches stackName
7. Disable DSQL deletion protection
   (`aws dsql update-cluster --no-deletion-protection-enabled`)
8. Disable Cognito deletion protection
   (`aws cognito-idp update-user-pool --deletion-protection INACTIVE`)
9. Empty S3 bucket (`aws s3 rm --recursive`)
10. Delete CloudFormation stack (`sam delete --no-prompts`)
11. Clean up SSM parameters
12. Remove `.boa/` directory
13. Print "Teardown complete. Stack '<name>' has been
    destroyed."

### What Survives Teardown

Three resources in `cli/templates/backend.yaml` have
`DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain`:

| Resource | Type | Line | Protection |
|----------|------|------|------------|
| `DsqlCluster` | `AWS::DSQL::Cluster` | 23 | `DeletionProtectionEnabled: true` |
| `UserPool` | `AWS::Cognito::UserPool` | 36 | `DeletionProtection: ACTIVE` |
| `StorageBucket` | `AWS::S3::Bucket` | 317 | None (just Retain policy) |

When CloudFormation deletes the stack (step 10), these
resources are disassociated from the stack but not destroyed.
Steps 7-8 disable deletion protection, and step 9 empties
the bucket, but no step issues `aws dsql delete-cluster`,
`aws cognito-idp delete-user-pool`, or
`aws s3api delete-bucket`.

### Agent Bypass

The confirmation prompt reads from stdin via `readline`.
`echo "<stack>" | boa teardown` satisfies it. Any coding
agent running the command through a Bash tool can read the
stack name from `.boa/config.json` and pipe it in.

`cli/commands/init.mjs` (lines 462-478) writes
`.claude/settings.json` with a blanket allow for
`Bash(boa *)`, which auto-approves all boa commands
including teardown.

### Retention Policy Rationale

`DeletionPolicy: Retain` protects against accidental stack
deletion via the CloudFormation console, a misbehaving
deploy, or `sam delete` run by mistake. This is the right
default and must not be changed. Teardown is the deliberate,
user-confirmed destruction path and must handle Retained
resources itself.

## Proposed CX / CX Specification

### TTY Check (Agent Guard)

When `boa teardown` is invoked in a non-interactive context,
it refuses immediately:

```
$ echo "my-stack" | boa teardown
Error: boa teardown must be run interactively from a terminal.

Teardown is a destructive operation that requires human confirmation.
It cannot be run from scripts, pipes, or automated tools.
```

Exit code: 1. No config is read, no warning is printed, no
AWS calls are made.

The check is `process.stdin.isTTY !== true`. This catches:
- Piped input (`echo "x" | boa teardown`)
- Agent Bash tool invocations (stdin is not a TTY)
- Cron, CI, or script-based invocations

An interactive terminal session passes the check and
proceeds to the existing warning box and confirmation prompt.

### Explicit Resource Deletion

After `sam.remove()` completes (current step 10), three new
deletion steps run:

```
Deleting CloudFormation stack 'my-app'...
  [OK] Stack deleted

Deleting retained resources...
  [OK] DSQL cluster 'abc123def' delete initiated
  [OK] Cognito user pool 'us-east-1_XyZ123' deleted
  [OK] S3 bucket 'my-app-storage-123456789012' deleted
```

Each deletion is attempted independently. If one fails, the
others still run.

### Post-Teardown Verification

After all deletions, a verification pass confirms each
retained resource is actually gone or in a deleting state:

```
Verifying resource cleanup...
  [OK] DSQL cluster: DELETING
  [OK] Cognito user pool: gone
  [OK] S3 bucket: gone
```

If any resource survives unexpectedly:

```
Verifying resource cleanup...
  [OK] DSQL cluster: DELETING
  [FAIL] Cognito user pool still exists (status: ACTIVE)
  [OK] S3 bucket: gone

WARNING: Some resources were not fully cleaned up.
Run these commands manually to finish:
  aws cognito-idp delete-user-pool --user-pool-id us-east-1_XyZ123 --region us-east-1
```

The command prints manual remediation commands for each
surviving resource and exits with code 1.

If all resources are verified gone or deleting, the existing
completion message prints and the command exits 0:

```
Teardown complete. Stack 'my-app' has been destroyed.
```

### Error Handling for Individual Deletions

Each resource deletion can fail independently. Failures are
reported but do not stop the remaining deletions:

**DSQL cluster deletion failure:**
```
  [FAIL] DSQL cluster 'abc123def' delete failed: <error message>
```

**Cognito user pool deletion failure:**
```
  [FAIL] Cognito user pool 'us-east-1_XyZ123' delete failed: <error message>
```

**S3 bucket deletion failure (non-empty):**
```
  [FAIL] S3 bucket 'my-app-storage-123456789012' delete failed: <error message>
```

**Already-deleted resource (not an error):**
If a resource is already gone (e.g., manually deleted), the
deletion step succeeds silently:
```
  [OK] DSQL cluster 'abc123def' already gone
```

### Claude Code Deny Rule

`boa init` writes `.claude/settings.json` with an explicit
deny for `boa teardown`:

```json
{
  "permissions": {
    "allow": [
      "Bash(boa *)",
      "Bash(npm install*)",
      "Bash(npx vite*)",
      "Bash(npx serve*)"
    ],
    "deny": [
      "Bash(boa teardown*)"
    ]
  }
}
```

Claude Code evaluates rules in order: deny, then allow.
The first matching rule wins. `Bash(boa teardown*)` in
`deny` blocks teardown even though `Bash(boa *)` is in
`allow`. When an agent attempts `boa teardown`, Claude Code
prompts the human for approval instead of auto-executing.

The console message updates to reflect the deny:

```
  [OK] .claude/settings.json written (boa commands auto-approved, teardown requires human approval)
```

## Technical Design

### TTY Guard (`cli/commands/teardown.mjs`)

Add as the first statement in `teardown()`, before loading
config:

```javascript
export default async function teardown(_args) {
  // Block non-interactive invocations
  if (!process.stdin.isTTY) {
    console.error(
      'Error: boa teardown must be run interactively'
        + ' from a terminal.\n'
    );
    console.error(
      'Teardown is a destructive operation that requires'
        + ' human confirmation.'
    );
    console.error(
      'It cannot be run from scripts, pipes, or automated'
        + ' tools.'
    );
    process.exit(1);
  }

  // ... existing code ...
}
```

`process.stdin.isTTY` is `true` when stdin is a terminal,
`undefined` otherwise. The check `!process.stdin.isTTY`
catches both `undefined` (pipe/file) and any falsy value.

### Explicit Resource Deletion

After `sam.remove()` (current step 10) and before SSM
cleanup (current step 11), add three new deletion steps.
Each uses `aws.exec()` from `cli/lib/aws.mjs` with
`shellEscape()` for all parameters.

**DSQL cluster deletion:**
```javascript
// Delete DSQL cluster (Retained by CloudFormation)
console.log('');
console.log('Deleting retained resources...');
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
```

Note: `dsqlClusterId` is already computed at line 110 of the
current file for the disable-protection step. Move it above
the disable-protection block so it is available for both
steps.

DSQL returns `ConflictException` (409) if deletion
protection is still enabled, and
`ResourceNotFoundException` (404) if the cluster does not
exist.

**Cognito user pool deletion:**
```javascript
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
```

Cognito returns `InvalidParameterException` if deletion
protection is still active, and
`ResourceNotFoundException` if the pool does not exist.

**S3 bucket deletion:**
```javascript
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

The bucket should already be empty from step 9
(`aws s3 rm --recursive`). If it is not empty,
`delete-bucket` fails with `BucketNotEmpty` and the error
is reported.

### Post-Teardown Verification

After all three deletions, verify each resource. DSQL
cluster statuses include: CREATING, ACTIVE, IDLE, UPDATING,
DELETING, DELETED, FAILED. The verification accepts
DELETING and DELETED as success.

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
  // ResourceNotFoundException means it's gone
  ok('DSQL cluster: gone');
}

// Verify Cognito user pool
try {
  aws.exec(
    `aws cognito-idp describe-user-pool`
      + ` --user-pool-id ${shellEscape(userPoolId)}`
      + ` --region ${shellEscape(region)}`
  );
  fail(`Cognito user pool still exists`);
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
  fail(`S3 bucket still exists`);
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

After the verification loop:

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

The exit code is determined at the end:

```javascript
// Existing completion message
console.log('');
console.log(
  `Teardown complete. Stack '${stackName}' has been`
    + ' destroyed.'
);

if (!allClean) {
  process.exit(1);
}
```

### Updated Step Order

The new teardown flow has 17 steps:

1. **TTY check** (new) -- refuse if not interactive
2. Load config
3. Read config values
4. Print warning box
5. Print stack details
6. Prompt for confirmation
7. Verify confirmation
8. Disable DSQL deletion protection
9. Disable Cognito deletion protection
10. Empty S3 bucket
11. Delete CloudFormation stack (`sam.remove()`)
12. **Delete DSQL cluster** (new)
13. **Delete Cognito user pool** (new)
14. **Delete S3 bucket** (new)
15. Clean up SSM parameters
16. Remove `.boa/` directory
17. **Verify resource cleanup** (new)
18. Print completion message (exit 1 if verification
    failed)

Steps 12-14 happen after step 11 because the stack must be
deleted first (CloudFormation owns the resources until then).
Step 17 happens after step 16 so that `.boa/` is cleaned up
regardless of verification outcome -- the config has already
been consumed and the AWS resources are either gone or will
need manual cleanup.

### Claude Code Deny Rule (`cli/commands/init.mjs`)

Update lines 467-476 to add a `deny` array:

```javascript
writeFileSync(claudeSettingsPath, JSON.stringify({
  permissions: {
    allow: [
      'Bash(boa *)',
      'Bash(npm install*)',
      'Bash(npx vite*)',
      'Bash(npx serve*)',
    ],
    deny: [
      'Bash(boa teardown*)',
    ],
  },
}, null, 2) + '\n');
ok('.claude/settings.json written'
  + ' (boa commands auto-approved,'
  + ' teardown requires human approval)');
```

### Helper Extraction Decision

The TTY check is 8 lines of code. Extracting it to
`cli/lib/interactive.mjs` would add a file, an import, and
indirection for a single call site. The prompt specifies
that `boa remove <extension>` and `boa migrate --revert`
should not be retrofitted in this change.

Decision: leave the TTY check inline in `teardown.mjs`.
When a second command needs it, extract at that point.
The pattern is simple enough to copy-and-adapt without a
shared helper.

### Import Changes

`teardown.mjs` needs one new import:

```javascript
import { fail } from '../lib/output.mjs';
```

Currently imports `ok` but not `fail`. Both are needed for
the deletion and verification steps.

## Code Architecture / File Changes

### Modified Files

| File | Change |
|------|--------|
| `cli/commands/teardown.mjs` | Add TTY guard, explicit DSQL/Cognito/S3 deletion after `sam.remove()`, post-teardown verification, import `fail` from output.mjs |
| `cli/commands/init.mjs` | Add `deny: ['Bash(boa teardown*)']` to `.claude/settings.json` output, update ok message |

### New Files

| File | Purpose |
|------|---------|
| `cli/__tests__/teardown.test.mjs` | Tests for TTY refusal and verification logic |

### Unchanged Files

| File | Why |
|------|-----|
| `cli/templates/backend.yaml` | `DeletionPolicy: Retain` must not change |
| `cli/lib/aws.mjs` | No new AWS wrappers needed; `exec()` and `shellEscape()` suffice |
| `cli/lib/sam.mjs` | `remove()` is unchanged |

## Testing Strategy

### Unit Tests (`cli/__tests__/teardown.test.mjs`)

Use `node:test` and `node:assert/strict`, matching the
existing test style in `cli/__tests__/cli.test.mjs`.

**TTY refusal test:**

Run `boa teardown` via `execFile` (stdin is not a TTY in
child processes spawned by `execFile`). Assert:
- Exit code is 1
- stderr contains "must be run interactively from a
  terminal"
- stdout is empty (no warning box, no config read)

```javascript
it('refuses to run when stdin is not a TTY', async () => {
  const { code, stderr, stdout } = await run(['teardown']);
  assert.equal(code, 1);
  assert.ok(
    stderr.includes('must be run interactively'),
    'should print TTY error'
  );
  assert.equal(stdout.trim(), '', 'should produce no stdout');
});
```

This test works without mocking because `execFile` always
provides a non-TTY stdin to the child process.

**Piped input refusal test:**

Spawn `boa teardown` with piped stdin (write stack name to
stdin). Assert same behavior as above:

```javascript
it('refuses piped input', async () => {
  const { code, stderr } = await runWithStdin(
    ['teardown'], 'my-stack\n'
  );
  assert.equal(code, 1);
  assert.ok(
    stderr.includes('must be run interactively'),
    'should print TTY error even with valid input on stdin'
  );
});
```

**Init deny-rule test:**

Run a simulated init or directly verify the JSON structure
that `init.mjs` would write. Since `init.mjs` requires AWS
credentials and a real deploy, this test checks the
structure by importing the relevant code or reading a
generated file:

```javascript
it('settings.json contains deny rule for teardown',
  async () => {
    // After running init in a test project, read the
    // generated settings file
    const settings = JSON.parse(
      readFileSync(
        join(testDir, '.claude', 'settings.json'), 'utf8'
      )
    );
    assert.ok(
      settings.permissions.deny.includes(
        'Bash(boa teardown*)'
      ),
      'deny list should include boa teardown'
    );
  }
);
```

### Manual Verification

The following must be verified against a live AWS account:

1. **Piped invocation blocked:**
   ```bash
   echo "my-stack" | boa teardown
   # Expected: exits 1 with TTY error, no AWS calls
   ```

2. **Interactive teardown deletes retained resources:**
   ```bash
   boa init test-teardown --region us-east-1
   boa teardown
   # Type "test-teardown" when prompted
   # Expected: DSQL cluster, Cognito pool, S3 bucket
   # all reported as deleted/deleting
   ```

3. **Post-teardown AWS verification:**
   ```bash
   aws dsql get-cluster \
     --identifier <cluster-id> --region us-east-1
   # Expected: DELETING status or ResourceNotFoundException

   aws cognito-idp describe-user-pool \
     --user-pool-id <pool-id> --region us-east-1
   # Expected: ResourceNotFoundException

   aws s3api head-bucket --bucket <bucket-name>
   # Expected: 404 Not Found
   ```

4. **Deny rule present in settings:**
   ```bash
   boa init test-deny --region us-east-1
   cat .claude/settings.json
   # Expected: deny array contains 'Bash(boa teardown*)'
   ```

### Edge Cases

- **Resource already deleted:** If someone manually deleted
  the DSQL cluster before teardown, the deletion step
  catches the ResourceNotFoundException and reports
  "already gone". Verification also passes.

- **Deletion protection not disabled:** If the
  disable-protection step (8 or 9) fails silently (as it
  does today with the catch block), the explicit delete
  will also fail. DSQL returns `ConflictException` (409)
  and Cognito returns `InvalidParameterException` if
  deletion protection is still active. The verification
  step will catch this and print the manual remediation
  command. This is the correct behavior -- the user gets
  actionable output instead of silent orphaning.

- **Cognito `update-user-pool` field wipe:** The
  `update-user-pool` call in step 9 (disable deletion
  protection) must pass all fields or it wipes
  LambdaConfig and auto-verify settings. Since the pool is
  about to be deleted, this is harmless in the teardown
  path. The existing code (line 124) passes only
  `--deletion-protection INACTIVE`, which wipes other
  config, but the pool is destroyed moments later. No
  change needed.

- **Partial stack deletion:** If `sam.remove()` fails
  partway, the retained resources may still be associated
  with the stack. The explicit delete calls should still
  work because deletion protection was already disabled.

- **DSQL cluster in CREATING state:** Calling
  `delete-cluster` on a CREATING cluster may return
  `ConflictException` (409). If this happens, the
  verification step will report the cluster as still
  existing and print the manual remediation command. This
  is an unlikely edge case (teardown during deploy) and
  the manual command is sufficient.

## Implementation Order

1. **`cli/commands/teardown.mjs` -- TTY guard.** Add the
   `process.stdin.isTTY` check as the first statement in
   `teardown()`. Add `fail` to the import from output.mjs.

2. **`cli/commands/teardown.mjs` -- explicit deletion.**
   After `sam.remove()`, add DSQL delete, Cognito delete,
   and S3 bucket delete steps.

3. **`cli/commands/teardown.mjs` -- verification.** After
   SSM cleanup and `.boa/` removal, add the verification
   pass. Set exit code 1 if any resource survives.

4. **`cli/commands/init.mjs` -- deny rule.** Add
   `deny: ['Bash(boa teardown*)']` to the settings.json
   output. Update the ok message.

5. **`cli/__tests__/teardown.test.mjs` -- tests.** Add
   TTY-refusal and piped-input tests.

6. **Manual validation** against a live AWS account using
   the verification plan above.

## Open Questions

None. The scope is tightly defined by the two observed bugs
and their fixes.
