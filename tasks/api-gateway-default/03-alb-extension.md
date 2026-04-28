# Task 03: ALB Extension + Extension Registry

**Agent:** implementer
**Design:** docs/design/api-gateway-default.md
**Depends on:** Task 02

## Objective

Create the `alb` extension (fragment + README), update the
extension registry and merge transform, and handle the
deprecated `api-gateway` alias.

## Target Tests

From `cli/__tests__/extensions.test.mjs`:

- `mergeTemplate(['alb'])` adds
  `ElasticLoadBalancingV2::LoadBalancer`
- `mergeTemplate(['alb'])` adds VPC resources
- `mergeTemplate(['alb'])` removes `AWS::Serverless::Api`
- `mergeTemplate(['alb'])` removes `Events` from
  `ApiFunction`
- `mergeTemplate(['alb'])` restores
  `ReservedConcurrentExecutions: 50`
- `mergeTemplate(['alb'])` flips `BETTER_AUTH_URL` to ALB
  DNS (`http://`)
- `mergeTemplate(['alb'])` flips `API_BASE_URL` to ALB DNS
- `mergeTemplate(['alb'])` adds `AlbUrl`, `AlbArn`,
  `TargetGroupArn`, `VpcId` to Outputs
- `mergeTemplate(['alb'])` removes `ApiGatewayUrl` and
  `RestApiId` from Outputs
- `mergeTemplate(['alb'])` adds `WafAlbAssociation` and
  removes `WafApiGatewayAssociation`
- `WafWebAcl` is still present after ALB merge
- `mergeTemplate(['api-gateway'])` returns base template
  unchanged (no-op)
- `getRegistry()` has `alb` key with `fragmentPath` and
  `description`
- `getRegistry()` has `api-gateway` key with
  `deprecated: true` and `fragmentPath: null`

## Implementation

### 1. Create `cli/extensions/alb/fragment.yaml`

Contains the 15 VPC + ALB resources removed from the base
template in Task 02, plus `WafAlbAssociation` and ALB
outputs. Copy the exact resource definitions from the
design document's ALB Extension section
(docs/design/api-gateway-default.md lines 538-684). The
fragment should contain:

**Resources:**
- `AlbVpc`, `InternetGateway`, `GatewayAttachment`
- `PublicSubnet1`, `PublicSubnet2`
- `PublicRouteTable`, `PublicRoute`
- `Subnet1RouteTableAssoc`, `Subnet2RouteTableAssoc`
- `AlbSecurityGroup`
- `ApplicationLoadBalancer`, `AlbLambdaPermission`,
  `AlbTargetGroup`, `AlbHttpListener`
- `WafAlbAssociation`

**Outputs:**
- `AlbUrl`, `AlbArn`, `TargetGroupArn`, `VpcId`

### 2. Create `cli/extensions/alb/README.md`

Copy the README content from the design document
(docs/design/api-gateway-default.md lines 686-722).

### 3. Update `cli/lib/extensions.mjs`

**Update `getRegistry()`:** Replace the existing
`api-gateway` entry and add `alb`:

```javascript
export function getRegistry() {
  return {
    'api-gateway': {
      description: 'API Gateway REST (now the default)',
      deprecated: true,
      fragmentPath: null,
    },
    'alb': {
      description: 'ALB + VPC + HTTP listener',
      fragmentPath: join(EXTENSIONS_DIR, 'alb', 'fragment.yaml'),
    },
  };
}
```

**Replace `mergeTemplate()` transform logic.** Remove the
existing `api-gateway` transform (lines 58-121) and
replace with the `alb` transform. The `alb` transform is
the symmetric inverse of what the old `api-gateway`
transform did:

When `extensions.includes('alb')`:
1. Remove `Api` resource and `WafApiGatewayAssociation`
   from base
2. Remove `Events` from `ApiFunction`
3. Restore `ReservedConcurrentExecutions: 50` on
   `ApiFunction`
4. Flip `BETTER_AUTH_URL` to
   `http://${ApplicationLoadBalancer.DNSName}`
5. Flip `API_BASE_URL` to
   `http://${ApplicationLoadBalancer.DNSName}/rest/v1`
6. Remove `ApiGatewayUrl` and `RestApiId` from Outputs
7. Merge ALB fragment resources and outputs into the
   document

When `extensions.includes('api-gateway')`:
1. Filter it out (no-op, it is now the default)
2. Continue merge with remaining extensions if any

Use the YAML manipulation patterns already established in
the existing `mergeTemplate()` -- `doc.getIn()`,
`doc.get()`, `baseResources.delete()`, `apiProps.delete()`,
`apiProps.set()`, `apiEnvVars.set()`, etc.

## Acceptance Criteria

- All target tests in `extensions.test.mjs` pass
- `cli/extensions/alb/fragment.yaml` is valid YAML with
  proper CloudFormation intrinsic functions
- `cli/extensions/alb/README.md` exists
- Existing tests for unchanged resources still pass
- The old `cli/extensions/api-gateway/fragment.yaml` file
  is NOT deleted (kept for reference during transition)

## Conflict Criteria

If all target tests already pass before any code changes
are made, investigate whether the tests are true positives
before marking the task complete. If the existing
`api-gateway` transform code uses YAML manipulation
methods not described here, adapt the `alb` transform to
use the same patterns.
