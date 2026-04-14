# Task 01: End-to-End Tests for CloudFront + WAF Protection

**Agent:** implementer
**Design:** docs/design/cloudfront-dow-protection.md

## Objective

Create a test file that validates the CloudFront + WAF
default traffic layer across the SAM template, CLI
commands, extension system, and documentation. All tests
should fail initially, confirming none of the changes have
been applied yet.

## Test File Path

Create `cli/__tests__/cloudfront-dow-protection.test.mjs`.

Use `node:test` and `node:assert/strict`. No new
dependencies. Follow the content-validation pattern
established by
`cli/__tests__/template-structure.test.mjs` -- read files
as strings and verify structural properties. For
`needsMigrationWarning`, import and call the function
directly (matching
`cli/__tests__/deploy-migration.test.mjs`).

## Test Cases

### SAM Template -- CloudFront Resources

Read `cli/templates/backend.yaml` as a string.

- Given the SAM template, when read, then it contains a
  `CloudFrontDistribution` resource
- Given the SAM template, when read, then it contains a
  `CloudFrontOAC` resource
- Given the SAM template, when read, then it contains a
  `CloudFrontCachePolicy` resource
- Given the SAM template, when read, then it contains a
  `CloudFrontOriginRequestPolicy` resource
- Given the SAM template, when read, then it contains a
  `CloudFrontInvokePermission` resource

### SAM Template -- WAF and Alarm Resources

- Given the SAM template, when read, then it contains a
  `WafWebAcl` resource
- Given the SAM template, when read, then it contains a
  `ThrottleAlarmTopic` resource
- Given the SAM template, when read, then it contains a
  `LambdaThrottleAlarm` resource

### SAM Template -- Conditions

- Given the SAM template, when read, then it contains a
  `Conditions` section with `IsUsEast1`
- Given the SAM template, when read, then `WafWebAcl` has
  `Condition: IsUsEast1`

### SAM Template -- Function Configuration

- Given the SAM template, when the `ApiFunction` section
  is parsed, then `AuthType` is `AWS_IAM` (not `NONE`)
- Given the SAM template, when the `ApiFunction` section
  is parsed, then `FunctionUrlConfig` does NOT contain a
  `Cors` block (check that no `Cors:` key appears between
  `FunctionUrlConfig:` and the next top-level property
  like `Environment:`)
- Given the SAM template, when the `ApiFunction` section
  is parsed, then it contains
  `ReservedConcurrentExecutions: 50`

### SAM Template -- Removed Public Permissions

- Given the SAM template, when read, then it does NOT
  contain `ApiFunctionUrlPermission` as a resource name
  (the string `ApiFunctionUrlPermission:` should not
  appear)
- Given the SAM template, when read, then it does NOT
  contain `ApiFunctionInvokePermission` as a resource
  name (the string `ApiFunctionInvokePermission:` should
  not appear)

### SAM Template -- CloudFront Permission Details

- Given the `CloudFrontInvokePermission` section, when
  parsed, then its Principal is `cloudfront.amazonaws.com`
- Given the `CloudFrontInvokePermission` section, when
  parsed, then its Action is `lambda:InvokeFunctionUrl`
- Given the `CloudFrontInvokePermission` section, when
  parsed, then its `FunctionUrlAuthType` is `AWS_IAM`

### SAM Template -- Cache Policy Details

- Given the `CloudFrontCachePolicy` section, when parsed,
  then the `Headers` list includes `Authorization`
- Given the `CloudFrontCachePolicy` section, when parsed,
  then the `Headers` list includes `apikey`
- Given the `CloudFrontCachePolicy` section, when parsed,
  then `DefaultTTL` is 60

### SAM Template -- Origin Request Policy Details

- Given the `CloudFrontOriginRequestPolicy` section, when
  parsed, then the `Headers` list includes `Content-Type`
- Given the `CloudFrontOriginRequestPolicy` section, when
  parsed, then the `Headers` list includes `Prefer`
- Given the `CloudFrontOriginRequestPolicy` section, when
  parsed, then the `Headers` list includes
  `accept-profile`

### SAM Template -- OAC Details

- Given the `CloudFrontOAC` section, when parsed, then it
  contains `OriginAccessControlOriginType: lambda`
- Given the `CloudFrontOAC` section, when parsed, then it
  contains `SigningBehavior: always`
- Given the `CloudFrontOAC` section, when parsed, then it
  contains `SigningProtocol: sigv4`

### SAM Template -- Distribution Details

- Given the `CloudFrontDistribution` section, when parsed,
  then it contains `PriceClass: PriceClass_100`
- Given the `CloudFrontDistribution` section, when parsed,
  then it contains `ViewerProtocolPolicy: https-only`
- Given the `CloudFrontDistribution` section, when parsed,
  then it contains `HttpVersion: http2and3`

### SAM Template -- WAF Rule Details

- Given the `WafWebAcl` section, when parsed, then it
  contains `Limit: 1000` (rate-based rule)
- Given the `WafWebAcl` section, when parsed, then it
  contains `AggregateKeyType: IP`
- Given the `WafWebAcl` section, when parsed, then it
  contains `AWSManagedRulesAmazonIpReputationList`

### SAM Template -- Outputs

- Given the SAM template Outputs section, when parsed,
  then it contains `CloudFrontUrl`
- Given the SAM template Outputs section, when parsed,
  then it contains `CloudFrontDistributionId`
- Given the SAM template Outputs section, when parsed,
  then it contains `ThrottleAlarmTopicArn`
- Given the SAM template Outputs section, when parsed,
  then `ApiFunctionUrl` is still present (kept for
  reference)

### CLI Init -- Output Extraction

Read `cli/commands/init.mjs` as a string.

- Given init.mjs source, when read, then it references
  `'CloudFrontUrl'` in a `getOutputValue` call
- Given init.mjs source, when read, then it references
  `'CloudFrontDistributionId'` in a `getOutputValue` call
- Given init.mjs source, when read, then it references
  `'ThrottleAlarmTopicArn'` in a `getOutputValue` call
- Given init.mjs source, when read, then the config
  object written includes a `functionUrl` property
- Given init.mjs source, when read, then the config
  object written includes a `cloudfront` property

### CLI Deploy -- Output Extraction and Migration Warning

Read `cli/commands/deploy.mjs` as a string. Import
`needsMigrationWarning` for unit tests.

- Given deploy.mjs source, when read, then it references
  `'CloudFrontUrl'` in a `getOutputValue` call
- Given deploy.mjs source, when read, then it references
  `'CloudFrontDistributionId'` in a `getOutputValue` call
- Given deploy.mjs source, when read, then it references
  `'ThrottleAlarmTopicArn'` in a `getOutputValue` call
- Given `needsMigrationWarning` called with a Function URL
  apiUrl and no cloudfront object, then it returns true
  (Function URL -> CloudFront migration)
- Given `needsMigrationWarning` called with a CloudFront
  apiUrl (`cloudfront.net`), then it returns false
- Given `needsMigrationWarning` called with a Function URL
  apiUrl AND a cloudfront object present, then it returns
  false (already upgraded)

### CLI Verify -- New Checks

Read `cli/commands/verify.mjs` as a string.

- Given verify.mjs source, when read, then it contains
  `cloudfront get-distribution` (CloudFront distribution
  check)
- Given verify.mjs source, when read, then it contains
  `wafv2 get-web-acl-for-resource` (WAF attachment check)
- Given verify.mjs source, when read, then it contains
  a curl of `cfg.functionUrl` and checks for HTTP 403
  (direct Function URL access check)
- Given verify.mjs source, when read, then it contains
  `ReservedConcurrentExecutions` (reserved concurrency
  check)
- Given verify.mjs source, when read, then it checks
  for `cloudfront.amazonaws.com` in the permission
  statements
- Given verify.mjs source, when read, then it skips
  the WAF check when region is not `us-east-1` (check
  for a conditional like `region === 'us-east-1'`)

### CLI Status -- Function URL Display

Read `cli/commands/status.mjs` as a string.

- Given status.mjs source, when read, then it displays
  `cfg.functionUrl` or `functionUrl`
- Given status.mjs source, when read, then it shows
  `(internal)` label next to the Function URL

### Extension System -- CloudFront Resource Removal

Read `cli/lib/extensions.mjs` as a string.

- Given extensions.mjs source, when read, then it
  contains `CloudFrontDistribution` in a removal list
  (when api-gateway extension is active)
- Given extensions.mjs source, when read, then it
  contains `CloudFrontOAC` in a removal list
- Given extensions.mjs source, when read, then it
  contains `WafWebAcl` in a removal list
- Given extensions.mjs source, when read, then it
  reverts AuthType (contains a reference to changing
  AuthType back to `'NONE'` or `NONE`)
- Given extensions.mjs source, when read, then it
  removes `ReservedConcurrentExecutions`

### Skill Documentation -- SKILL.md

Read `plugin/skills/boa/SKILL.md` as a string.

- Given SKILL.md, when read, then the architecture
  diagram includes `CloudFront` (not just Function URL
  directly)
- Given SKILL.md, when read, then it mentions `WAF`
  in the context of the default traffic layer

### Plugin Documentation -- CLAUDE.md

Read `plugin/CLAUDE.md` as a string.

- Given plugin CLAUDE.md, when read, then the API
  layer row in the architecture table mentions
  `CloudFront` (not just `Lambda Function URLs (free)`)

### API Patterns -- API-PATTERNS.md

Read `plugin/docs/API-PATTERNS.md` as a string.

- Given API-PATTERNS.md, when read, then it contains a
  section about CloudFront as the default traffic layer

### Pitfalls -- PITFALLS.md

Read `plugin/docs/PITFALLS.md` as a string.

- Given PITFALLS.md, when read, then it contains an entry
  for CloudFront 403 or direct Function URL 403
- Given PITFALLS.md, when read, then it contains an entry
  for CORS through CloudFront
- Given PITFALLS.md, when read, then it contains an entry
  for cache stale data

## Implementation Notes

- Read each file using `readFileSync` from `node:fs`,
  relative to the test file location using
  `dirname(fileURLToPath(import.meta.url))`.
- For template tests, use `string.includes()` and regex.
  Do not parse YAML -- string matching is sufficient and
  avoids adding a YAML parser dependency.
- For CLI source tests, read the source as a string and
  check for presence of specific function calls, variable
  names, and string literals.
- For `needsMigrationWarning`, import the function
  directly from `../commands/deploy.mjs` and call it
  with test configs, matching the pattern in
  `cli/__tests__/deploy-migration.test.mjs`.
- Group tests into `describe` blocks by concern:
  "SAM template -- CloudFront resources",
  "SAM template -- WAF and alarm",
  "SAM template -- conditions",
  "SAM template -- function configuration",
  "SAM template -- removed permissions",
  "SAM template -- CloudFront permission details",
  "SAM template -- cache policy",
  "SAM template -- origin request policy",
  "SAM template -- outputs",
  "CLI init -- output extraction",
  "CLI deploy -- output extraction and migration",
  "CLI verify -- new checks",
  "CLI status -- Function URL display",
  "Extension system -- CloudFront removal",
  "Skill documentation",
  "Plugin documentation",
  "API patterns",
  "Pitfalls".

## Acceptance Criteria

- Test file compiles and runs with
  `node --test cli/__tests__/cloudfront-dow-protection.test.mjs`
- All tests fail with clear assertion messages indicating
  what is missing
- No test panics or produces cryptic failures

## Conflict Criteria

- If any test that should fail instead passes, first
  diagnose why by following the "Unexpected test results"
  steps in the implementer prompt: investigate the code
  path, verify the assertion targets the right behavior,
  and attempt to rewrite the test to isolate the intended
  path. Only escalate if you cannot construct a
  well-formed test that targets the desired behavior.
- Specifically: the existing template has `AuthType: NONE`
  and contains `ApiFunctionUrlPermission` and
  `ApiFunctionInvokePermission` -- tests asserting their
  removal should fail. The existing `needsMigrationWarning`
  does not detect Function URL -> CloudFront migration --
  that test should fail.
