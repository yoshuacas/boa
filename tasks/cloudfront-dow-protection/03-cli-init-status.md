# Task 03: CLI Init and Status -- CloudFront Output Extraction

**Agent:** implementer
**Design:** docs/design/cloudfront-dow-protection.md
**Depends on:** Task 02

## Objective

Update `cli/commands/init.mjs` to extract CloudFront
outputs from CloudFormation and write the new config
format, and update `cli/commands/status.mjs` to display
the Function URL with an "(internal)" label.

## Target Tests

From `cli/__tests__/cloudfront-dow-protection.test.mjs`:

- init.mjs references `'CloudFrontUrl'` in getOutputValue
- init.mjs references `'CloudFrontDistributionId'` in
  getOutputValue
- init.mjs references `'ThrottleAlarmTopicArn'` in
  getOutputValue
- init.mjs config object includes `functionUrl` property
- init.mjs config object includes `cloudfront` property
- status.mjs displays `cfg.functionUrl` or `functionUrl`
- status.mjs shows `(internal)` label

## Implementation

### `cli/commands/init.mjs`

**Change 1: Extract new CloudFormation outputs**

In the output extraction block (around lines 365-375),
add extraction of the three new outputs:

```javascript
const functionUrl = getOutputValue(
  outputs, 'ApiFunctionUrl'
);
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

Change the existing `apiUrl` extraction: instead of
assigning `ApiFunctionUrl` directly to `apiUrl`, derive
the primary API URL from CloudFront:

```javascript
const apiUrl = cloudFrontUrl || functionUrl;
```

**Change 2: Update config.write call**

Update the config object (around lines 383-396) to
include the new fields:

```javascript
config.write({
  stackName: name,
  region,
  accountId,
  apiUrl,
  functionUrl,
  cloudfront: distributionId ? {
    distributionId,
    domainName: new URL(cloudFrontUrl).hostname,
  } : undefined,
  anonKey,
  serviceRoleKey,
  userPoolId,
  userPoolClientId,
  bucketName,
  dsqlEndpoint,
  deployedAt: new Date().toISOString(),
  extensions: [],
});
```

**Change 3: Update summary output**

Update the summary block (around lines 449-458) to show
both URLs:

```javascript
console.log(`  API URL:      ${apiUrl}`);
if (functionUrl && functionUrl !== apiUrl) {
  console.log(
    `  Function URL: ${functionUrl} (internal)`
  );
}
```

**Change 4: Update deployment message**

Around the SAM deploy call (line 361), update the message
to set expectations about CloudFront deploy time:

```javascript
console.log(
  `Deploying stack '${name}' to ${region}...`
);
console.log(
  '  (CloudFront distribution takes ~10 minutes)'
);
```

**Change 5: Update CLAUDE.md generation**

In the `generateClaudeMd` function, update the
architecture diagram to show CloudFront in front of the
Function URL. Change:

```
Lambda Function URL ─── pgrest-lambda engine
```

to:

```
CloudFront + WAF (DDoS protection, rate limiting)
    │
    ▼
Lambda Function URL ─── pgrest-lambda engine
```

Also update the Configuration section to include
`functionUrl` and `cloudfront` fields.

### `cli/commands/status.mjs`

**Change 1: Add Function URL display**

After the `API URL` line (line 20), add:

```javascript
if (cfg.functionUrl) {
  console.log(
    `  Function URL: ${cfg.functionUrl} (internal)`
  );
}
```

## Acceptance Criteria

- All "CLI init" and "CLI status" tests pass
- Existing tests still pass
- The config object shape matches the design's Config
  Format specification
- The summary output matches the design's `boa init`
  Output specification

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If init.mjs already extracts CloudFront outputs,
  escalate -- the design assumes it does not.
