# Task 06: Extension System -- CloudFront Resource Removal

**Agent:** implementer
**Design:** docs/design/cloudfront-dow-protection.md
**Depends on:** Task 02

## Objective

Update `cli/lib/extensions.mjs` so the `api-gateway`
extension removes CloudFront, WAF, alarm, and related
resources from the merged template, reverts AuthType to
NONE, restores CORS, removes ReservedConcurrentExecutions,
and cleans up CloudFront-related outputs.

## Target Tests

From `cli/__tests__/cloudfront-dow-protection.test.mjs`:

- extensions.mjs contains `CloudFrontDistribution` in a
  removal list
- extensions.mjs contains `CloudFrontOAC` in a removal
  list
- extensions.mjs contains `WafWebAcl` in a removal list
- extensions.mjs reverts AuthType to NONE
- extensions.mjs removes `ReservedConcurrentExecutions`

## Implementation

### `cli/lib/extensions.mjs`

**Change 1: Add CloudFront resource removal to the
api-gateway extension transform**

In the `if (extensions.includes('api-gateway'))` block
(lines 58-81), add the following BEFORE the existing
Events injection code:

```javascript
// Remove CloudFront resources
const cloudFrontResources = [
  'CloudFrontDistribution', 'CloudFrontOAC',
  'CloudFrontCachePolicy',
  'CloudFrontOriginRequestPolicy',
  'CloudFrontInvokePermission', 'WafWebAcl',
  'LambdaThrottleAlarm', 'ThrottleAlarmTopic',
];
const baseResources = doc.get('Resources', true);
for (const name of cloudFrontResources) {
  baseResources.delete(name);
}
```

**Change 2: Revert AuthType to NONE**

```javascript
// Revert AuthType to NONE for API Gateway
doc.setIn(
  ['Resources', 'ApiFunction', 'Properties',
   'FunctionUrlConfig', 'AuthType'],
  'NONE'
);
```

**Change 3: Remove ReservedConcurrentExecutions**

```javascript
// Remove reserved concurrency (API Gateway has its
// own throttling)
const apiProps = doc.getIn(
  ['Resources', 'ApiFunction', 'Properties'], true
);
apiProps.delete('ReservedConcurrentExecutions');
```

**Change 4: Restore CORS on FunctionUrlConfig**

API Gateway invokes Lambda directly through the Function
URL, and browsers may still reach the Function URL. Add
back the CORS block:

```javascript
// Restore CORS on FunctionUrlConfig
const corsNode = doc.createNode({
  AllowHeaders: [
    'Content-Type', 'Authorization', 'apikey',
    'Prefer', 'Accept', 'x-client-info',
    'X-Client-Info', 'X-Supabase-Api-Version',
    'content-profile', 'accept-profile',
  ],
  AllowMethods: [
    'GET', 'POST', 'PUT', 'PATCH', 'DELETE',
  ],
  AllowOrigins: ['*'],
  MaxAge: 600,
});
const funcUrlConfig = doc.getIn(
  ['Resources', 'ApiFunction', 'Properties',
   'FunctionUrlConfig'], true
);
funcUrlConfig.set('Cors', corsNode);
```

**Change 5: Add back public permissions**

The api-gateway extension needs public invoke permissions
since API Gateway invokes Lambda directly:

```javascript
// Restore public invoke permissions
const urlPerm = doc.createNode({
  Type: 'AWS::Lambda::Permission',
  Properties: {
    FunctionName: { 'Fn::GetAtt': ['ApiFunction', 'Arn'] },
    Action: 'lambda:InvokeFunctionUrl',
    Principal: '*',
    FunctionUrlAuthType: 'NONE',
  },
});
const invokePerm = doc.createNode({
  Type: 'AWS::Lambda::Permission',
  Properties: {
    FunctionName: { 'Fn::GetAtt': ['ApiFunction', 'Arn'] },
    Action: 'lambda:InvokeFunction',
    Principal: '*',
    InvokedViaFunctionUrl: true,
  },
});
baseResources.set('ApiFunctionUrlPermission', urlPerm);
baseResources.set(
  'ApiFunctionInvokePermission', invokePerm
);
```

**Change 6: Remove CloudFront outputs**

```javascript
// Remove CloudFront-related outputs
const baseOutputs = doc.get('Outputs', true);
for (const key of [
  'CloudFrontUrl', 'CloudFrontDistributionId',
  'ThrottleAlarmTopicArn',
]) {
  baseOutputs.delete(key);
}
```

**Change 7: Remove IsUsEast1 condition**

```javascript
// Remove CloudFront-only condition
const conditions = doc.get('Conditions', true);
if (conditions) {
  conditions.delete('IsUsEast1');
  // Remove empty Conditions section
  if (conditions.items && conditions.items.length === 0) {
    doc.delete('Conditions');
  }
}
```

### Ordering

All the removal/revert code should run BEFORE the existing
Events injection code. The final block order in the
api-gateway section should be:

1. Remove CloudFront resources
2. Revert AuthType
3. Remove ReservedConcurrentExecutions
4. Restore CORS
5. Add public permissions
6. Remove CloudFront outputs
7. Remove IsUsEast1 condition
8. Add Events (existing code)

## Test Requirements

The existing `cli/__tests__/extensions.test.mjs` tests
should be updated or extended to verify:

- `mergeTemplate(['api-gateway'])` result does NOT contain
  `CloudFrontDistribution`
- `mergeTemplate(['api-gateway'])` result contains
  `AuthType: NONE`
- `mergeTemplate(['api-gateway'])` result does NOT contain
  `ReservedConcurrentExecutions`

## Acceptance Criteria

- All "Extension system" tests pass
- `cli/__tests__/extensions.test.mjs` passes
- `mergeTemplate([])` returns template WITH CloudFront
  resources
- `mergeTemplate(['api-gateway'])` returns template
  WITHOUT CloudFront resources and WITH AuthType: NONE
- No YAML syntax errors in generated output

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If extensions.mjs already contains CloudFront removal
  logic, escalate -- the design assumes it does not.
