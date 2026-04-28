# Task 01: End-to-End Tests

**Agent:** implementer
**Design:** docs/design/api-gateway-default.md

## Objective

Write tests that verify the default traffic layer is API
Gateway REST + WAF, and that ALB is available as an
extension. These tests cover template structure,
extension merging, deploy migration guards, CLI command
output, and the deprecated `api-gateway` alias.

## Test Files

Update these existing test files. Do not create new test
files -- the project already has the right test files in
place.

- `cli/__tests__/template-structure.test.mjs`
- `cli/__tests__/extensions.test.mjs`
- `cli/__tests__/extend-command.test.mjs`
- `cli/__tests__/remove-command.test.mjs`
- `cli/__tests__/extensions-list-command.test.mjs`
- `cli/__tests__/deploy-migration.test.mjs`

## Test Cases

### template-structure.test.mjs

Replace the existing "SAM template -- ALB default" suite
with "SAM template -- API Gateway default". Remove all
assertions about ALB being in the base template and
replace them with the following:

**Given** the base template `cli/templates/backend.yaml`
**When** parsed as YAML:

1. **Then** it contains a resource of type
   `AWS::Serverless::Api`
2. **Then** it does NOT contain a resource of type
   `ElasticLoadBalancingV2::LoadBalancer`
3. **Then** it does NOT contain a resource of type
   `AWS::EC2::VPC`
4. **Then** it contains a resource named
   `WafApiGatewayAssociation` (not `WafAlbAssociation`)
5. **Then** Outputs contains `ApiGatewayUrl` and
   `RestApiId`
6. **Then** Outputs does NOT contain `AlbUrl`, `AlbArn`,
   `TargetGroupArn`, or `VpcId`
7. **Then** `ApiFunction` does NOT have
   `ReservedConcurrentExecutions`
8. **Then** `ApiFunction` has `Events` with keys
   `ProxyRoot` and `ProxyPlus`
9. **Then** the `BETTER_AUTH_URL` env var on `ApiFunction`
   contains `execute-api` (HTTPS API Gateway URL)
10. **Then** the `API_BASE_URL` env var on `ApiFunction`
    contains `execute-api` (HTTPS API Gateway URL)
11. **Then** `WafWebAcl` resource still exists with
    `Scope: REGIONAL`

Keep the existing tests for resources that don't change:
`DsqlCluster`, `StorageBucket`, `WafWebAcl` rules, no
`FunctionUrlConfig`, no `CloudFrontDistribution`, no
Cognito resources, better-auth env vars.

### extensions.test.mjs

Replace the "Template merging -- api-gateway extension"
suite with "Template merging -- alb extension":

**Given** the base template merged with `['alb']`
**When** the merged YAML is parsed:

1. **Then** it contains
   `ElasticLoadBalancingV2::LoadBalancer`
2. **Then** it contains `AWS::EC2::VPC` (AlbVpc)
3. **Then** it does NOT contain `AWS::Serverless::Api`
4. **Then** `ApiFunction` does NOT have `Events`
5. **Then** `ApiFunction` has
   `ReservedConcurrentExecutions: 50`
6. **Then** `BETTER_AUTH_URL` on `ApiFunction` uses ALB
   DNS (contains `http://` and
   `ApplicationLoadBalancer.DNSName`)
7. **Then** `API_BASE_URL` on `ApiFunction` uses ALB DNS
8. **Then** Outputs contains `AlbUrl`, `AlbArn`,
   `TargetGroupArn`, `VpcId`
9. **Then** Outputs does NOT contain `ApiGatewayUrl` or
   `RestApiId`
10. **Then** it contains `WafAlbAssociation` and does NOT
    contain `WafApiGatewayAssociation`
11. **Then** `WafWebAcl` is still present (not removed by
    the alb transform -- it lives in the base template,
    not the fragment)

Update "Template merging -- base (no extensions)":

12. **Then** base template has `AWS::Serverless::Api`
    (was: no Api)
13. **Then** base template has `ApiGatewayUrl` output
    (was: `AlbUrl`)

Add "Template merging -- api-gateway deprecated":

14. **Given** `mergeTemplate(['api-gateway'])`
    **Then** the result is the base template unchanged
    (api-gateway is a no-op since it is now the default)

Update registry tests:

15. **Then** `getRegistry()` returns an object with `alb`
    key that has a `fragmentPath` and `description`
16. **Then** `getRegistry()` returns an object with
    `api-gateway` key that has `deprecated: true` and
    `fragmentPath: null`

### extend-command.test.mjs

Update the "already enabled" test to use `alb` instead of
`api-gateway`.

Add a test for the deprecated `api-gateway` alias:

17. **Given** a project with valid config
    **When** `boa extend api-gateway` is run
    **Then** it prints "api-gateway is now the default
    traffic layer. No action needed." and exits with
    code 0

Add a test for `boa extend alb` on a legacy ALB project:

28. **Given** a project with `cfg.alb` set but
    `extensions` does not include `'alb'`
    **When** `boa extend alb` is run
    **Then** it prints "This project already uses ALB
    (legacy default)." and adds `'alb'` to extensions
    and exits 0

### remove-command.test.mjs

Update extension name references from `api-gateway` to
`alb`. Specifically:

29. **Given** no config file
    **When** `boa remove alb` is run
    **Then** it exits with error (no config)

30. **Given** a valid config with `extensions: []`
    **When** `boa remove alb` is run
    **Then** it prints "Extension 'alb' is not enabled."

31. **Given** a valid config with
    `extensions: ['alb']`
    **When** `boa remove alb` is run
    **Then** it proceeds (does not error on validation)

### extensions-list-command.test.mjs

18. **Then** `alb` appears in available extensions
19. **Then** `api-gateway` appears with a deprecated marker
20. **When** `alb` is enabled in config, it shows
    `[enabled]` status

### deploy-migration.test.mjs

Replace existing `needsMigrationWarning()` tests:

21. **Given** config with `alb` block but no `extensions`
    array
    **Then** `needsMigrationWarning()` returns legacy ALB
    warning string

22. **Given** config with `alb` block AND
    `extensions: ['alb']`
    **Then** `needsMigrationWarning()` returns `null`

23. **Given** config with `apiGateway` block
    **Then** `needsMigrationWarning()` returns `null`

24. **Given** config with `cloudfront` block
    **Then** `needsMigrationWarning()` returns CloudFront
    warning

25. **Given** config with `apiUrl` containing `lambda-url.`
    **Then** `needsMigrationWarning()` returns Function URL
    warning

26. **Given** config with no `apiUrl`
    **Then** `needsMigrationWarning()` returns `null`

27. **Given** config with
    `extensions: ['api-gateway']` and no `alb` block
    **Then** `needsMigrationWarning()` returns `null`
    (api-gateway in extensions is a legacy no-op, not a
    migration scenario)

## Implementation Notes

- Use the same test framework and patterns as the
  existing test files (Node.js built-in test runner with
  `node:test` and `node:assert`).
- Read the template YAML using the same approach as
  existing tests (fs.readFileSync + yaml.parseDocument).
- For extension merge tests, call `mergeTemplate()`
  directly and parse the result.
- For deploy-migration tests, call
  `needsMigrationWarning()` with synthetic config objects.
- For extend-command tests, follow the existing mock
  pattern for process.exit and console.log.

## Acceptance Criteria

- All test files parse and compile without errors
- `node --test cli/__tests__/template-structure.test.mjs`
  runs and all new tests FAIL (template still has ALB)
- `node --test cli/__tests__/extensions.test.mjs` runs
  and new ALB extension tests FAIL (extension doesn't
  exist yet)
- `node --test cli/__tests__/deploy-migration.test.mjs`
  runs and new migration tests FAIL (logic not updated)
- `node --test cli/__tests__/extend-command.test.mjs`
  runs and deprecated alias test FAILS
- `node --test cli/__tests__/extensions-list-command.test.mjs`
  runs and new tests FAIL
- Existing tests that cover unchanged resources
  (DsqlCluster, S3, WAF rules, auth) continue to pass

## Conflict Criteria

If any test that is expected to fail instead passes,
first diagnose why by following the "Unexpected test
results" steps: investigate the code path, verify the
assertion targets the right behavior, and attempt to
rewrite the test to isolate the intended path. Only
escalate if you cannot construct a well-formed test that
targets the desired behavior.
