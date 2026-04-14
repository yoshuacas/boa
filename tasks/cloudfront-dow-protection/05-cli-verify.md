# Task 05: CLI Verify -- CloudFront, WAF, 403, and Concurrency Checks

**Agent:** implementer
**Design:** docs/design/cloudfront-dow-protection.md
**Depends on:** Task 02

## Objective

Update `cli/commands/verify.mjs` to replace the 2 public
permission checks with 5 new checks for CloudFront
distribution, WAF attachment, CloudFront permission,
direct Function URL 403, and reserved concurrency.

## Target Tests

From `cli/__tests__/cloudfront-dow-protection.test.mjs`:

- verify.mjs contains `cloudfront get-distribution`
- verify.mjs contains `wafv2 get-web-acl-for-resource`
- verify.mjs curls `cfg.functionUrl` and checks for 403
- verify.mjs contains `ReservedConcurrentExecutions`
- verify.mjs checks for `cloudfront.amazonaws.com` in
  permission statements
- verify.mjs skips WAF check when region is not us-east-1

## Implementation

### `cli/commands/verify.mjs`

The current verify command (168 lines) runs 5 checks:
1. Cognito self-signup
2. Function URL permissions (InvokeFunctionUrl +
   InvokeFunction)
3. API endpoint responding
4. S3 bucket exists
5. S3 Block Public Access

Replace checks 2-3 with the new CloudFront-aware checks.
The full check list becomes:

1. Cognito self-signup (unchanged)
2. CloudFront distribution is deployed (new)
3. WAF WebACL is attached (new, us-east-1 only)
4. CloudFront has lambda:InvokeFunctionUrl permission
   (updated)
5. Direct Function URL returns 403 (new)
6. API responding through CloudFront (updated URL source)
7. S3 bucket exists (unchanged)
8. S3 Block Public Access (unchanged)
9. Reserved concurrency is set (new)

**Change 1: Destructure `functionUrl` from config**

At line 7, add `functionUrl` to the destructured config:

```javascript
const {
  stackName, region, apiUrl, functionUrl,
  userPoolId, bucketName,
} = cfg;
```

**Change 2: Replace Check 2 (permission check) with
CloudFront checks**

Replace the current Check 2 block (lines 53-101) with:

```javascript
// Check 2: CloudFront distribution
if (cfg.cloudfront) {
  console.log('Checking CloudFront distribution...');
  let distStatus;
  try {
    distStatus = aws.exec(
      `aws cloudfront get-distribution` +
        ` --id ${cfg.cloudfront.distributionId}` +
        ` --query 'Distribution.Status'` +
        ` --output text`
    );
  } catch {
    distStatus = null;
  }
  check(
    distStatus === 'Deployed',
    'CloudFront distribution is deployed'
  );

  // Check 3: WAF attached (us-east-1 only)
  if (region === 'us-east-1') {
    let wafArn;
    try {
      const distArn =
        `arn:aws:cloudfront::${cfg.accountId}` +
        `:distribution/` +
        `${cfg.cloudfront.distributionId}`;
      wafArn = aws.exec(
        `aws wafv2 get-web-acl-for-resource` +
          ` --resource-arn ${distArn}` +
          ` --region us-east-1` +
          ` --query 'WebACL.ARN' --output text`
      );
    } catch {
      wafArn = null;
    }
    check(
      wafArn && wafArn !== 'None',
      'WAF WebACL is attached to distribution'
    );
  }
}

// Check 4: CloudFront permission
console.log('Checking Function URL permissions...');
const functionName = `${stackName}-api`;
let policy;
try {
  const policyJson = aws.exec(
    `aws lambda get-policy` +
      ` --function-name ${functionName}` +
      ` --region ${region}` +
      ` --query 'Policy' --output text`
  );
  policy = JSON.parse(policyJson);
} catch {
  policy = null;
}
if (policy) {
  const statements = policy.Statement || [];
  const hasCfPermission = statements.some(
    (s) => s.Effect === 'Allow'
      && s.Action === 'lambda:InvokeFunctionUrl'
      && s.Principal?.Service ===
         'cloudfront.amazonaws.com'
  );
  check(
    hasCfPermission,
    'CloudFront has lambda:InvokeFunctionUrl permission'
  );
} else {
  check(false, 'Function URL resource policy exists');
}

// Check 5: Direct Function URL returns 403
if (functionUrl) {
  console.log('Checking Function URL access...');
  let directCode;
  try {
    directCode = aws.exec(
      `curl -s -o /dev/null -w '%{http_code}'` +
        ` ${functionUrl}/rest/v1/`
    );
  } catch {
    directCode = '000';
  }
  check(
    directCode === '403',
    'Direct Function URL returns 403 (protected by IAM)'
  );
}
```

**Change 3: Update API endpoint check (Check 6)**

The current Check 3 (lines 103-118) curls `apiUrl`. This
stays the same since `apiUrl` now points to CloudFront.
Update the check message:

```javascript
console.log('Checking API endpoint...');
let httpCode;
try {
  httpCode = aws.exec(
    `curl -s -o /dev/null -w '%{http_code}'` +
      ` ${apiUrl}/rest/v1/`
  );
} catch {
  httpCode = '000';
}
const validCodes = ['200', '401', '404'];
if (validCodes.includes(httpCode)) {
  check(
    true,
    `API is responding through CloudFront (HTTP ${httpCode})`
  );
} else {
  check(
    false,
    `API returns unexpected HTTP ${httpCode}`
    + ` (expected 200/401/404)`
  );
}
```

**Change 4: Add reserved concurrency check (Check 9)**

After the S3 checks, add:

```javascript
// Check 9: Reserved concurrency
console.log('Checking Lambda concurrency...');
let concurrency;
try {
  concurrency = aws.exec(
    `aws lambda get-function` +
      ` --function-name ${functionName}` +
      ` --region ${region}` +
      ` --query` +
      ` 'Concurrency.ReservedConcurrentExecutions'` +
      ` --output text`
  );
} catch {
  concurrency = null;
}
check(
  concurrency && concurrency !== 'None',
  `Reserved concurrency is set (${concurrency})`
);
```

Note: `functionName` is defined in Check 4. Make sure
it's accessible in Check 9's scope (define it before
Check 2 or at the top of the function).

### Updating Existing Tests

The existing `cli/__tests__/function-url-permission.test.mjs`
has tests that check verify.mjs for `lambda:InvokeFunctionUrl`
and `lambda:InvokeFunction` permission checks. The new verify
code still checks `lambda:InvokeFunctionUrl` but now looks
for `cloudfront.amazonaws.com` instead of generic public
permissions. Update or remove tests that no longer apply:

- The `lambda:InvokeFunctionUrl` permission check test
  should still pass (verify still checks for it)
- The `lambda:InvokeFunction` permission check test should
  be removed or updated (verify no longer checks for
  public `lambda:InvokeFunction`)
- The `get-policy` call test should still pass

## Acceptance Criteria

- All "CLI verify" tests pass
- Existing tests that haven't changed still pass
- The verify command checks 9 items for us-east-1 and
  8 for us-east-2 (WAF skipped)
- Check messages match the design's `boa verify` output
  specification

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If verify.mjs already contains CloudFront checks,
  escalate -- the design assumes it does not.
