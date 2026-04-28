# Task 04: CLI Commands -- init, deploy, verify, status

**Agent:** implementer
**Design:** docs/design/api-gateway-default.md
**Depends on:** Task 02, Task 03

## Objective

Update CLI commands to extract API Gateway outputs by
default, write `apiGateway` config block, handle legacy
ALB projects, and add API Gateway verification checks.

## Target Tests

From `cli/__tests__/deploy-migration.test.mjs`:

- Config with `alb` block but no `extensions` triggers
  legacy ALB warning
- Config with `alb` block AND `extensions: ['alb']` does
  NOT trigger warning
- Config with `apiGateway` block does NOT trigger warning
- Config with `cloudfront` block triggers warning
- Config with `lambda-url` apiUrl triggers warning
- Config with no `apiUrl` does NOT trigger warning

From `cli/__tests__/extend-command.test.mjs`:

- `boa extend api-gateway` prints deprecated alias message
  and exits 0
- `boa extend alb` on legacy ALB project prints message
  and adds to extensions

From `cli/__tests__/remove-command.test.mjs`:

- Remove-command tests pass with `alb` as extension name

## Implementation

### 1. `cli/commands/init.mjs`

**Lines 372-388 (output extraction):** Replace ALB output
extraction with API Gateway:

```javascript
const apiGatewayUrl = getOutputValue(
  outputs, 'ApiGatewayUrl'
);
const restApiId = getOutputValue(outputs, 'RestApiId');
const bucketName = getOutputValue(outputs, 'BucketName');
const dsqlEndpoint = getOutputValue(
  outputs, 'DsqlEndpoint'
);
const apiUrl = apiGatewayUrl;
```

Remove extraction of `AlbUrl`, `AlbArn`, `TargetGroupArn`,
`VpcId`.

**Lines 399-424 (config write):** Replace `alb` block with
`apiGateway` block:

```javascript
config.write({
  stackName: name,
  region,
  accountId,
  apiUrl,
  apiGateway: restApiId ? {
    restApiId,
    stage: 'prod',
  } : undefined,
  anonKey,
  serviceRoleKey,
  authProvider: 'better-auth',
  pgrestLambdaVersion,
  bucketName,
  dsqlEndpoint,
  deployedAt: new Date().toISOString(),
  extensions: [],
});
```

**Line 94 (`generateClaudeMd()`):** In the architecture
diagram string, change:
```
ALB + WAF (DDoS protection, rate limiting)
```
to:
```
API Gateway REST + WAF (HTTPS, rate limiting)
```

**Line 241 (config comment):** Change
`apiUrl: ... (ALB endpoint, primary entry point)` to
`apiUrl: ... (API Gateway endpoint, primary entry point)`.

### 2. `cli/commands/deploy.mjs`

**Lines 12-32 (`needsMigrationWarning()`):** Replace
existing logic with the new detection:

```javascript
export function needsMigrationWarning(cfg) {
  const extensions = cfg.extensions || [];
  if (cfg.alb && !extensions.includes('alb')) {
    return 'This project uses ALB as the traffic layer'
      + ' (legacy default). Keeping ALB.';
  }
  if (cfg.cloudfront && !cfg.apiGateway) {
    return 'This version of BOA uses API Gateway REST'
      + ' + WAF by default instead of CloudFront.';
  }
  if (cfg.apiUrl
      && cfg.apiUrl.includes('lambda-url.')
      && !cfg.apiGateway) {
    return 'This version of BOA uses API Gateway REST'
      + ' + WAF by default.';
  }
  return null;
}
```

**Lines 88-95 (output extraction):** Extract API Gateway
outputs instead of ALB:

```javascript
const apiGatewayUrl = getOutputValue(
  outputs, 'ApiGatewayUrl'
);
const restApiId = getOutputValue(outputs, 'RestApiId');
let apiUrl = apiGatewayUrl;
```

**After `needsMigrationWarning()` call:** Auto-apply ALB
extension for legacy projects:

```javascript
if (cfg.alb && !extensions.includes('alb')) {
  extensions.push('alb');
}
```

**Filter out deprecated `api-gateway` from extensions:**
When `extensions` contains `'api-gateway'`, silently
remove it (it is now the default, so the entry is a
no-op). This cleanup happens on every config write:

```javascript
const filtered = extensions.filter(
  e => e !== 'api-gateway'
);
```

Use `filtered` instead of `extensions` when writing config.

**Lines 104-135 (config write):** Write `apiGateway` block
by default. When `alb` extension is active, extract ALB
outputs and set the `alb` block instead:

```javascript
const updatedConfig = {
  stackName,
  region,
  accountId: cfg.accountId,
  apiUrl,
  apiGateway: restApiId ? {
    restApiId,
    stage: 'prod',
  } : undefined,
  anonKey: cfg.anonKey,
  serviceRoleKey: cfg.serviceRoleKey,
  authProvider: cfg.authProvider || 'better-auth',
  pgrestLambdaVersion: getPinnedPgrestLambdaVersion(),
  bucketName,
  dsqlEndpoint,
  deployedAt: new Date().toISOString(),
  extensions,
};

if (extensions.includes('alb')) {
  const albUrl = getOutputValue(outputs, 'AlbUrl');
  const albArn = getOutputValue(outputs, 'AlbArn');
  const targetGroupArn = getOutputValue(
    outputs, 'TargetGroupArn'
  );
  const vpcId = getOutputValue(outputs, 'VpcId');
  updatedConfig.apiUrl = albUrl;
  updatedConfig.alb = albArn ? {
    arn: albArn,
    dnsName: new URL(albUrl).hostname,
    targetGroupArn,
    vpcId,
  } : undefined;
  delete updatedConfig.apiGateway;
}
```

### 3. `cli/commands/verify.mjs`

Add `shellEscape` to imports from `../lib/aws.mjs`.

**Add API Gateway checks** when `cfg.apiGateway` is
present (after the auth schema check, before the API
endpoint check):

```javascript
if (cfg.apiGateway) {
  console.log('Checking API Gateway...');
  let stageExists;
  try {
    aws.exec(
      `aws apigateway get-stage`
        + ` --rest-api-id ${shellEscape(cfg.apiGateway.restApiId)}`
        + ` --stage-name ${shellEscape(cfg.apiGateway.stage)}`
        + ` --region ${shellEscape(region)}`
        + ` --output text --query 'stageName'`
    );
    stageExists = true;
  } catch {
    stageExists = false;
  }
  check(
    stageExists,
    `API Gateway stage '${cfg.apiGateway.stage}' exists`
  );

  console.log('Checking WAF attachment...');
  let wafArn;
  try {
    const stageArn =
      `arn:aws:apigateway:${region}`
        + `::/restapis/${cfg.apiGateway.restApiId}`
        + `/stages/${cfg.apiGateway.stage}`;
    wafArn = aws.exec(
      `aws wafv2 get-web-acl-for-resource`
        + ` --resource-arn ${shellEscape(stageArn)}`
        + ` --region ${shellEscape(region)}`
        + ` --query 'WebACL.ARN' --output text`
    );
  } catch {
    wafArn = null;
  }
  check(
    wafArn && wafArn !== 'None',
    'WAF WebACL is attached to API Gateway stage'
  );
}
```

**ALB checks:** Wrap existing ALB target group health
check and WAF ALB check behind `if (cfg.alb)` (verify
they're already conditional on `cfg.alb`).

**Reserved concurrency check (lines 166-182):** Wrap
behind `if (cfg.alb)`:

```javascript
if (cfg.alb) {
  console.log('Checking Lambda concurrency...');
  // ... existing check ...
}
```

**Line 118 (success message):** Change
"API is responding through ALB" to "API is responding".

### 4. `cli/commands/status.mjs`

**Lines 21-23:** Replace ALB line with conditional:

```javascript
if (cfg.apiGateway) {
  console.log(
    `  API Gateway: ${cfg.apiGateway.restApiId}`
      + ` (stage: ${cfg.apiGateway.stage})`
  );
} else if (cfg.alb) {
  console.log(`  ALB:         ${cfg.alb.dnsName}`);
}
```

### 5. `cli/commands/extend.mjs`

Add a special case before the registry validation for the
deprecated `api-gateway` alias:

```javascript
if (name === 'api-gateway') {
  console.log(
    'api-gateway is now the default traffic layer.'
      + ' No action needed.'
  );
  console.log(
    'Run `boa remove alb` if you\'re switching away'
      + ' from ALB.'
  );
  process.exit(0);
}
```

Also handle the edge case where `boa extend alb` is run
on a legacy ALB project (has `cfg.alb` but no
`extensions.includes('alb')`). Add a check:

```javascript
if (name === 'alb' && cfg.alb
    && !extensions.includes('alb')) {
  console.log(
    'This project already uses ALB (legacy default).'
  );
  console.log(
    'Adding alb to extensions for explicit tracking...'
  );
  extensions.push('alb');
  cfg.extensions = extensions;
  config.write(cfg);
  console.log("Extension 'alb' enabled.");
  process.exit(0);
}
```

## Acceptance Criteria

- All target tests in `deploy-migration.test.mjs` pass
- All target tests in `extend-command.test.mjs` pass
- All target tests in `remove-command.test.mjs` pass
- No regressions in other test files
- `needsMigrationWarning()` correctly detects legacy ALB
  projects and returns appropriate warning strings
- Legacy configs with `extensions: ['api-gateway']` have
  the entry silently removed on next deploy config write

## Conflict Criteria

If all target tests already pass before any code changes
are made, investigate whether the tests are true positives
before marking the task complete. If the existing
`deploy.mjs` config write structure differs significantly
from what's described here, adapt the implementation to
match the existing patterns while achieving the same
result.
