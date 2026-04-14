# Task 04: CLI Deploy -- CloudFront Output Extraction and Migration Warning

**Agent:** implementer
**Design:** docs/design/cloudfront-dow-protection.md
**Depends on:** Task 02

## Objective

Update `cli/commands/deploy.mjs` to extract CloudFront
outputs, update the config format, and add a migration
warning for existing projects upgrading from raw Function
URLs to CloudFront.

## Target Tests

From `cli/__tests__/cloudfront-dow-protection.test.mjs`:

- deploy.mjs references `'CloudFrontUrl'` in
  getOutputValue
- deploy.mjs references `'CloudFrontDistributionId'` in
  getOutputValue
- deploy.mjs references `'ThrottleAlarmTopicArn'` in
  getOutputValue
- needsMigrationWarning detects Function URL -> CloudFront
  migration (Function URL apiUrl + no cloudfront object)
- needsMigrationWarning returns false for CloudFront
  apiUrl
- needsMigrationWarning returns false when cloudfront
  object exists

## Implementation

### `cli/commands/deploy.mjs`

**Change 1: Update `needsMigrationWarning`**

The current function (lines 10-18) only detects API
Gateway -> Function URL migration. Add detection for
Function URL -> CloudFront migration:

```javascript
export function needsMigrationWarning(cfg) {
  const extensions = cfg.extensions || [];
  // API Gateway -> Function URL migration
  const isApiGateway = cfg.apiUrl &&
    cfg.apiUrl.includes('execute-api.') &&
    cfg.apiUrl.includes('.amazonaws.com') &&
    !extensions.includes('api-gateway');
  // Function URL -> CloudFront migration
  const isFunctionUrl = cfg.apiUrl &&
    cfg.apiUrl.includes('lambda-url.') &&
    !cfg.cloudfront;
  return isApiGateway || isFunctionUrl;
}
```

**Change 2: Add CloudFront migration warning message**

After the existing migration warning block (around lines
34-42), add a separate warning for Function URL ->
CloudFront:

```javascript
if (
  cfg.apiUrl &&
  cfg.apiUrl.includes('lambda-url.') &&
  !cfg.cloudfront
) {
  console.log(
    '  ! This version of boa adds CloudFront + WAF'
    + ' protection.'
  );
  console.log(
    '    Your API URL will change. Update your'
    + ' frontend config after deploy.'
  );
  console.log('');
}
```

**Change 3: Extract CloudFront outputs**

In the output extraction block (around lines 70-78), add:

```javascript
const cloudFrontUrl = getOutputValue(
  outputs, 'CloudFrontUrl'
);
const distributionId = getOutputValue(
  outputs, 'CloudFrontDistributionId'
);
const throttleTopicArn = getOutputValue(
  outputs, 'ThrottleAlarmTopicArn'
);
```

Update `apiUrl` derivation. Currently (line 71) it reads
`ApiFunctionUrl` directly. Change to:

```javascript
const functionUrlOutput = getOutputValue(
  outputs, 'ApiFunctionUrl'
);
let apiUrl = cloudFrontUrl || functionUrlOutput;
```

**Change 4: Update config writing**

The current config writing (lines 94-111) needs to
include CloudFront fields. Update the `updatedConfig`
object:

```javascript
const updatedConfig = {
  stackName,
  region,
  accountId: cfg.accountId,
  apiUrl,
  functionUrl: functionUrlOutput,
  anonKey: cfg.anonKey,
  serviceRoleKey: cfg.serviceRoleKey,
  userPoolId,
  userPoolClientId,
  bucketName,
  dsqlEndpoint,
  deployedAt: new Date().toISOString(),
  extensions,
};

// Add cloudfront object when CloudFront is active
if (distributionId && cloudFrontUrl) {
  updatedConfig.cloudfront = {
    distributionId,
    domainName: new URL(cloudFrontUrl).hostname,
  };
}

// When api-gateway extension is active, use Gateway URL
// and remove cloudfront object
if (extensions.includes('api-gateway')) {
  const gatewayUrl = getOutputValue(
    outputs, 'ApiGatewayUrl'
  );
  if (gatewayUrl) {
    updatedConfig.apiUrl = gatewayUrl;
  }
  delete updatedConfig.cloudfront;
}
```

**Change 5: Update deployment message**

Around line 63, update the deploy message to mention
CloudFront timing:

```javascript
console.log('Deploying...');
```

This can stay as-is since deploys that don't modify the
distribution are fast.

### Update Existing Tests

The existing `cli/__tests__/deploy-migration.test.mjs`
tests `needsMigrationWarning`. The test "Function URL ->
no warning" (line 22-25) will need updating because
Function URL apiUrls now DO trigger a warning (when no
cloudfront object exists). Update it:

```javascript
it('Function URL without cloudfront → warning', () => {
  assert.ok(needsMigrationWarning({
    apiUrl: 'https://abc123.lambda-url.us-east-1.on.aws/',
    extensions: [],
  }));
});

it('Function URL with cloudfront → no warning', () => {
  assert.ok(!needsMigrationWarning({
    apiUrl: 'https://abc123.lambda-url.us-east-1.on.aws/',
    cloudfront: { distributionId: 'E123' },
    extensions: [],
  }));
});

it('CloudFront URL → no warning', () => {
  assert.ok(!needsMigrationWarning({
    apiUrl: 'https://d111111abcdef8.cloudfront.net',
    cloudfront: { distributionId: 'E123' },
    extensions: [],
  }));
});
```

## Acceptance Criteria

- All "CLI deploy" tests pass
- Updated `cli/__tests__/deploy-migration.test.mjs`
  tests pass
- Existing tests still pass
- The `needsMigrationWarning` function correctly detects
  both API Gateway and Function URL migration scenarios

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If `needsMigrationWarning` already handles Function URL
  detection, escalate -- the design assumes it does not.
