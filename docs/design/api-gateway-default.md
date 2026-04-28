# API Gateway REST as Default Traffic Layer

## Overview

Make API Gateway REST + WAF the default traffic layer for
new BOA backends and demote ALB to an optional extension.

ALB currently ships with no HTTPS listener (an ACM cert and
custom domain are required for TLS). This means `boa init`
produces an HTTP `apiUrl`. Chrome's HTTPS-First mode
(default since Chrome 117) silently rewrites `http://`
subresource requests to `https://`, the ALB has no TLS
listener, the request resets, and the browser reports
`TypeError: Failed to fetch` with no CORS error in the
console. Any frontend served over HTTPS also blocks the
HTTP API as mixed content. This is the single most common
"my app doesn't work" failure in BOA.

API Gateway REST ships HTTPS on the AWS-managed
`*.execute-api.<region>.amazonaws.com` endpoint, requires
no ACM cert or domain, and already exists as the
`api-gateway` extension. The infrastructure to flip the
default is already in place in
`cli/extensions/api-gateway/fragment.yaml` and the
transform in `cli/lib/extensions.mjs:58-121`.

After this change:

- `boa init` produces an HTTPS `apiUrl` out of the box. No
  ACM cert, no domain, no CloudFront, no dev proxy.
- ALB becomes an optional extension for long-request,
  streaming, or high-throughput workloads that outgrow API
  Gateway's 29 s / 10 MB limits.
- WAF stays in the default stack, associated with the API
  Gateway stage instead of an ALB.
- `@supabase/supabase-js` and `@boa-cloud/client` keep
  working unchanged. The change is transport only.
- Existing ALB-backed projects keep working. `boa deploy`
  on an old project does not silently swap the traffic
  layer.

## Current CX / Concepts

### Default Backend Template

`cli/templates/backend.yaml` (285 lines) creates a
serverless backend with ALB + WAF as the traffic layer.
The template includes:

- `DsqlCluster` (Aurora DSQL, line 23)
- `ApiFunction` (Lambda, line 36) with
  `ReservedConcurrentExecutions: 50` (line 42) and
  env vars pointing to ALB:
  - `BETTER_AUTH_URL: !Sub 'http://${ApplicationLoadBalancer.DNSName}'`
    (line 50)
  - `API_BASE_URL: !Sub 'http://${ApplicationLoadBalancer.DNSName}/rest/v1'`
    (line 53)
- VPC resources (lines 67-136): `AlbVpc`, 2 public
  subnets, internet gateway, route table, security group
- ALB resources (lines 151-191): `ApplicationLoadBalancer`,
  `AlbLambdaPermission`, `AlbTargetGroup`,
  `AlbHttpListener` (HTTP only, port 80)
- WAF resources (lines 192-233): `WafWebAcl` (REGIONAL,
  rate-limit + ip-reputation rules), `WafAlbAssociation`
  (associated with ALB ARN)
- `StorageBucket` (S3, line 239)
- Outputs (lines 261-284): `AlbUrl` (HTTP), `AlbArn`,
  `TargetGroupArn`, `VpcId`, `BucketName`, `DsqlEndpoint`

### Current `api-gateway` Extension

`cli/extensions/api-gateway/fragment.yaml` (27 lines)
defines `AWS::Serverless::Api` with CORS and gateway
responses, plus an `ApiGatewayUrl` output.

`cli/lib/extensions.mjs:58-121` applies the transform when
this extension is enabled:

1. Removes all ALB, VPC, and WAF resources (16 resources
   including `WafWebAcl`)
2. Removes `ReservedConcurrentExecutions` from `ApiFunction`
3. Flips `BETTER_AUTH_URL` and `API_BASE_URL` env vars from
   ALB DNS to API Gateway stage URL (`Fn::Sub` format)
4. Removes ALB-related outputs (`AlbUrl`, `AlbArn`,
   `TargetGroupArn`, `VpcId`)
5. Adds `Events` (ProxyRoot `/` and ProxyPlus `/{proxy+}`)
   to `ApiFunction`

### CLI Commands That Reference ALB

| File | ALB Reference |
|------|---------------|
| `cli/commands/init.mjs:383-391` | Extracts `AlbUrl`, `AlbArn`, `TargetGroupArn`, `VpcId` from CloudFormation outputs; sets `apiUrl = albUrl` |
| `cli/commands/init.mjs:405-423` | Writes `alb` block to `.boa/config.json` with `arn`, `dnsName`, `targetGroupArn`, `vpcId` |
| `cli/commands/deploy.mjs:13-33` | `needsMigrationWarning()` checks for CloudFront, Function URL, and API Gateway URL patterns to warn about ALB migration |
| `cli/commands/deploy.mjs:88-95` | Extracts ALB outputs, sets `apiUrl = albUrl` |
| `cli/commands/deploy.mjs:104-123` | Writes `alb` block to config; when `api-gateway` extension active, uses Gateway URL instead |
| `cli/commands/verify.mjs:55-103` | Checks ALB target group health and WAF attachment when `cfg.alb` is present |
| `cli/commands/verify.mjs:118` | Success message says "API is responding through ALB" |
| `cli/commands/verify.mjs:166-182` | Checks reserved concurrency is set |
| `cli/commands/status.mjs:21-23` | Prints `ALB: <dnsName>` when `cfg.alb` exists |
| `cli/commands/teardown.mjs` | No ALB-specific teardown (CloudFormation handles VPC/ALB deletion) |

### Config Shape (Current Default)

`.boa/config.json` after `boa init`:

```json
{
  "stackName": "my-app",
  "region": "us-east-1",
  "accountId": "123456789012",
  "apiUrl": "http://my-app-alb-123456789.us-east-1.elb.amazonaws.com",
  "alb": {
    "arn": "arn:aws:elasticloadbalancing:...",
    "dnsName": "my-app-alb-123456789.us-east-1.elb.amazonaws.com",
    "targetGroupArn": "arn:aws:elasticloadbalancing:...",
    "vpcId": "vpc-abc123"
  },
  "anonKey": "eyJ...",
  "serviceRoleKey": "eyJ...",
  "authProvider": "better-auth",
  "pgrestLambdaVersion": "x.y.z",
  "bucketName": "my-app-storage-123456789012",
  "dsqlEndpoint": "abc123.dsql.us-east-1.on.aws",
  "deployedAt": "2026-04-27T00:00:00.000Z",
  "extensions": []
}
```

### Existing Tests

| File | What It Covers |
|------|----------------|
| `cli/__tests__/template-structure.test.mjs` | Asserts base template has ALB, WAF, VPC; no FunctionUrlConfig |
| `cli/__tests__/extensions.test.mjs` | Asserts `api-gateway` extension removes ALB, adds Api; base has no Api |
| `cli/__tests__/extend-command.test.mjs` | CLI validation for `boa extend` (no args, no config, unknown, already enabled) |
| `cli/__tests__/remove-command.test.mjs` | CLI validation for `boa remove` (no args, no config, not enabled) |
| `cli/__tests__/extensions-list-command.test.mjs` | `boa extensions` output with/without config, enabled status |
| `cli/__tests__/deploy-migration.test.mjs` | `needsMigrationWarning()` for CloudFront, Function URL, API Gateway URL patterns |

### HTTPS Problem in Detail

1. Developer runs `boa init`. Stack deploys with ALB.
   `apiUrl` is `http://my-app-alb-xxx.us-east-1.elb.amazonaws.com`.

2. Developer builds a frontend (React, Next.js, Vue).
   Connects with `@supabase/supabase-js` using the
   HTTP `apiUrl`.

3. Frontend is served over HTTPS (Amplify, Vercel,
   `localhost` with Vite's default HTTPS, or any modern
   hosting). The browser blocks `http://` API calls as
   mixed content, or Chrome HTTPS-First silently upgrades
   them to `https://`.

4. The ALB has no HTTPS listener. The upgraded request
   fails. The browser shows `TypeError: Failed to fetch`
   with no CORS error. The developer spends hours debugging
   CORS when the problem is TLS.

5. The fix requires an ACM certificate and a custom domain,
   which is a significant setup for a first deploy.

## Proposed CX / CX Specification

### New Projects

`boa init` prints:

```
Deploying stack 'my-app' to us-east-1...

  ...SAM build + deploy output...

Extracting stack outputs...

BOA deployment complete

  API URL:      https://abc123.execute-api.us-east-1.amazonaws.com/prod
  Anon Key:         eyJhbGciOiJIUzI1...
  Service Role Key: eyJhbGciOiJIUzI1...
  Auth Provider:    better-auth
  pgrest-lambda:    x.y.z
  S3 Bucket:        my-app-storage-123456789012
  DSQL Endpoint:    abc123.dsql.us-east-1.on.aws

  API Docs:     https://abc123.execute-api.us-east-1.amazonaws.com/prod/rest/v1/_docs
```

`.boa/config.json` is smaller. No `alb` block:

```json
{
  "stackName": "my-app",
  "region": "us-east-1",
  "accountId": "123456789012",
  "apiUrl": "https://abc123.execute-api.us-east-1.amazonaws.com/prod",
  "apiGateway": {
    "restApiId": "abc123",
    "stage": "prod"
  },
  "anonKey": "eyJ...",
  "serviceRoleKey": "eyJ...",
  "authProvider": "better-auth",
  "pgrestLambdaVersion": "x.y.z",
  "bucketName": "my-app-storage-123456789012",
  "dsqlEndpoint": "abc123.dsql.us-east-1.on.aws",
  "deployedAt": "2026-04-27T00:00:00.000Z",
  "extensions": []
}
```

### `boa verify` Output (Default)

```
BOA Verification

  Stack:  my-app
  Region: us-east-1

Checking auth schema...
  [PASS] better-auth schema is ready
Checking API Gateway...
  [PASS] API Gateway stage 'prod' exists
Checking WAF attachment...
  [PASS] WAF WebACL is attached to API Gateway stage
Checking API endpoint...
  [PASS] API is responding (HTTP 401)
Checking S3 bucket...
  [PASS] S3 bucket exists
  [PASS] S3 bucket has Block Public Access enabled

======================================
  Results: 6/6 checks passed
  All checks passed
======================================
```

When `cfg.alb` is absent, `verify` skips the ALB target
group health check and the reserved concurrency check (API
Gateway has its own throttling). It adds two API Gateway
checks: stage existence and WAF association.

### `boa status` Output (Default)

```
BOA Status

  Stack:       my-app
  Region:      us-east-1
  API URL:     https://abc123.execute-api.us-east-1.amazonaws.com/prod
  API Gateway: abc123 (stage: prod)
  Deployed at: 2026-04-27T00:00:00.000Z
  Extensions:  (none)
```

When `cfg.apiGateway` is present (default), prints the
`API Gateway:` line. When `cfg.alb` is present (legacy or
ALB extension), prints `ALB:` line instead.

### Adding ALB Extension

```bash
boa extend alb
boa deploy
```

Output from `boa extend alb`:

```
Adding extension 'alb'...

Building SAM application...
  ...SAM build output...

Deploying...
  ...SAM deploy output...

Updating configuration...

Extension 'alb' enabled.
API URL: http://my-app-alb-xxx.us-east-1.elb.amazonaws.com
```

After enabling ALB, the config gains an `alb` block, loses
the `apiGateway` block, and `apiUrl` becomes the ALB DNS.

### Removing ALB Extension

```bash
boa remove alb
boa deploy
```

Reverts to API Gateway default. `apiUrl` becomes HTTPS
again.

### Traffic Layer Policy

One traffic layer at a time. ALB and API Gateway do not
coexist in the same stack. When `boa extend alb` runs, it
removes API Gateway from the merged template and installs
ALB. When `boa remove alb` runs, it reverts to API
Gateway.

### `api-gateway` Extension (Deprecated Alias)

`boa extend api-gateway` prints:

```
api-gateway is now the default traffic layer. No action
needed. Run `boa remove alb` if you're switching away
from ALB.
```

Exit code 0. No template changes. The extension name
remains in the registry for one release to avoid confusion
during the transition.

### Existing ALB Projects

`.boa/config.json` with an `alb` block continues to work.
On `boa deploy`, the CLI detects it and keeps the ALB
template path:

```
Deploying stack 'my-app' in region 'us-east-1'...

  This project uses ALB as the traffic layer (legacy
  default). Keeping ALB. To move to API Gateway, tear down
  and re-run boa init, or wait for
  `boa migrate traffic api-gateway`.
```

No silent swap. The existing deploy-migration safety checks
in `cli/commands/deploy.mjs:13-33` already handle other
migration scenarios. This adds the inverse guard: if
`cfg.alb` exists and the base template no longer has ALB,
the deploy uses the ALB extension's merged template
automatically.

### Error Messages

**`boa extend alb` when already using ALB (legacy):**
```
Error: Extension 'alb' is already enabled.
```

**`boa remove alb` when not using ALB:**
```
Error: Extension 'alb' is not enabled.
```

**`boa extend api-gateway` (deprecated):**
```
api-gateway is now the default traffic layer. No action
needed. Run `boa remove alb` if you're switching away
from ALB.
```

### Edge Cases

**Legacy project with `extensions: ['api-gateway']`:**
An existing project that previously ran `boa extend
api-gateway` has `extensions: ['api-gateway']` in config.
After the default flip, `mergeTemplate` treats
`api-gateway` as a no-op (it is already the default).
Deploy proceeds normally. The extension is silently
dropped from the array on the next config write. No user
action needed.

**`boa extend alb` on a legacy ALB project:** A legacy
project has `cfg.alb` set but `extensions` does not
include `'alb'`. The `extend.mjs` command checks
`extensions.includes(name)` but also needs to check
`cfg.alb` to detect the implicit ALB state. Add a check:

```javascript
if (name === 'alb' && cfg.alb
    && !extensions.includes('alb')) {
  console.log(
    'This project already uses ALB (legacy default).'
  );
  console.log(
    'Adding alb to extensions for explicit tracking...'
  );
  // Add to extensions and rewrite config
  extensions.push('alb');
  cfg.extensions = extensions;
  config.write(cfg);
  console.log("Extension 'alb' enabled.");
  process.exit(0);
}
```

This makes the implicit ALB explicit without redeploying.

**`boa remove alb` on a legacy ALB project:** A legacy
project has `cfg.alb` but `extensions` does not include
`'alb'`. The `remove.mjs` command checks
`extensions.includes(name)` and would report "not enabled."
This is correct behavior: the user should first run
`boa extend alb` (which makes it explicit) and then
`boa remove alb` (which redeploys with API Gateway).
Alternatively, tearing down and re-running `boa init`
achieves the same result.

## Technical Design

### Base Template Changes (`cli/templates/backend.yaml`)

Move the API Gateway REST resources from the current
extension fragment into the base template.

**Add:**

1. `AWS::Serverless::Api` resource (`Api`), copied from
   `cli/extensions/api-gateway/fragment.yaml:1-22`:

   ```yaml
   Api:
     Type: AWS::Serverless::Api
     Properties:
       Name: !Sub '${ProjectName}-api'
       StageName: prod
       Cors:
         AllowMethods: "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
         AllowHeaders: "'Content-Type,Authorization,apikey,Prefer,Accept,x-client-info,X-Client-Info,X-Supabase-Api-Version,content-profile,accept-profile'"
         AllowOrigin: "'*'"
         MaxAge: "'600'"
       GatewayResponses:
         DEFAULT_4XX:
           ResponseParameters:
             Headers:
               Access-Control-Allow-Origin: "'*'"
               Access-Control-Allow-Headers: "'Content-Type,Authorization,apikey,Prefer,Accept,x-client-info,X-Client-Info,X-Supabase-Api-Version,content-profile,accept-profile'"
         DEFAULT_5XX:
           ResponseParameters:
             Headers:
               Access-Control-Allow-Origin: "'*'"
               Access-Control-Allow-Headers: "'Content-Type,Authorization,apikey,Prefer,Accept,x-client-info,X-Client-Info,X-Supabase-Api-Version,content-profile,accept-profile'"
   ```

2. API events on `ApiFunction`:

   ```yaml
   Events:
     ProxyRoot:
       Type: Api
       Properties:
         RestApiId: !Ref Api
         Path: /
         Method: ANY
     ProxyPlus:
       Type: Api
       Properties:
         RestApiId: !Ref Api
         Path: /{proxy+}
         Method: ANY
   ```

3. WAF stage association replacing the ALB association:

   ```yaml
   WafApiGatewayAssociation:
     Type: AWS::WAFv2::WebACLAssociation
     Properties:
       ResourceArn: !Sub 'arn:aws:apigateway:${AWS::Region}::/restapis/${Api}/stages/prod'
       WebACLArn: !GetAtt WafWebAcl.Arn
   ```

   The stage ARN format
   `arn:aws:apigateway:<region>::/restapis/<id>/stages/<name>`
   is correct for WAFv2 associations. Note the double colon
   (no account ID) and the leading `/` after `::`. This
   format is documented in the AWS WAFv2 API reference and
   confirmed in the existing `api-gateway` extension's
   production usage.

4. New outputs:

   ```yaml
   ApiGatewayUrl:
     Description: API Gateway endpoint URL (primary API endpoint)
     Value: !Sub 'https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod'

   RestApiId:
     Description: API Gateway REST API ID
     Value: !Ref Api
   ```

**Modify on `ApiFunction`:**

- Flip env vars:
  - `BETTER_AUTH_URL: !Sub 'https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod'`
  - `API_BASE_URL: !Sub 'https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod/rest/v1'`
- Remove `ReservedConcurrentExecutions: 50` (API Gateway
  has its own throttling at 10,000 requests/second default)

**Remove (15 resources):**

- `AlbVpc`, `InternetGateway`, `GatewayAttachment`
- `PublicSubnet1`, `PublicSubnet2`
- `PublicRouteTable`, `PublicRoute`
- `Subnet1RouteTableAssoc`, `Subnet2RouteTableAssoc`
- `AlbSecurityGroup`
- `ApplicationLoadBalancer`, `AlbLambdaPermission`,
  `AlbTargetGroup`, `AlbHttpListener`
- `WafAlbAssociation`

Note: `WafWebAcl` stays in the base template. Both
traffic layers use the same WAF rules. The current
`api-gateway` extension removes `WafWebAcl` (dropping
WAF entirely); the new design keeps WAF on all paths.

**Remove from Outputs:**

- `AlbUrl`, `AlbArn`, `TargetGroupArn`, `VpcId`

**Keep unchanged:**

- `DsqlCluster`, `StorageBucket`, `WafWebAcl` (rules
  unchanged), `BucketName`, `DsqlEndpoint`

**Update `Description`:**

```yaml
Description: BOA - Backend on AWS serverless stack (API Gateway, WAF, Aurora DSQL, Lambda, S3)
```

### ALB Extension (`cli/extensions/alb/`)

Create `cli/extensions/alb/fragment.yaml` containing every
resource the default base template currently has and the
new API Gateway default lacks:

```yaml
Resources:
  AlbVpc:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsSupport: true
      EnableDnsHostnames: true
      Tags:
        - Key: Name
          Value: !Sub '${ProjectName}-alb-vpc'

  InternetGateway:
    Type: AWS::EC2::InternetGateway
    Properties:
      Tags:
        - Key: Name
          Value: !Sub '${ProjectName}-igw'

  GatewayAttachment:
    Type: AWS::EC2::VPCGatewayAttachment
    Properties:
      VpcId: !Ref AlbVpc
      InternetGatewayId: !Ref InternetGateway

  PublicSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref AlbVpc
      CidrBlock: 10.0.1.0/24
      AvailabilityZone: !Select [0, !GetAZs '']
      MapPublicIpOnLaunch: true
      Tags:
        - Key: Name
          Value: !Sub '${ProjectName}-public-1'

  PublicSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref AlbVpc
      CidrBlock: 10.0.2.0/24
      AvailabilityZone: !Select [1, !GetAZs '']
      MapPublicIpOnLaunch: true
      Tags:
        - Key: Name
          Value: !Sub '${ProjectName}-public-2'

  PublicRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref AlbVpc

  PublicRoute:
    Type: AWS::EC2::Route
    DependsOn: GatewayAttachment
    Properties:
      RouteTableId: !Ref PublicRouteTable
      DestinationCidrBlock: 0.0.0.0/0
      GatewayId: !Ref InternetGateway

  Subnet1RouteTableAssoc:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet1
      RouteTableId: !Ref PublicRouteTable

  Subnet2RouteTableAssoc:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet2
      RouteTableId: !Ref PublicRouteTable

  AlbSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: !Sub '${ProjectName} ALB - allow HTTP'
      VpcId: !Ref AlbVpc
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0

  ApplicationLoadBalancer:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Name: !Sub '${ProjectName}-alb'
      Scheme: internet-facing
      Type: application
      Subnets:
        - !Ref PublicSubnet1
        - !Ref PublicSubnet2
      SecurityGroups:
        - !Ref AlbSecurityGroup
      Tags:
        - Key: Project
          Value: !Ref ProjectName

  AlbLambdaPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !GetAtt ApiFunction.Arn
      Action: lambda:InvokeFunction
      Principal: elasticloadbalancing.amazonaws.com

  AlbTargetGroup:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    DependsOn: AlbLambdaPermission
    Properties:
      Name: !Sub '${ProjectName}-tg'
      TargetType: lambda
      Targets:
        - Id: !GetAtt ApiFunction.Arn

  AlbHttpListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref ApplicationLoadBalancer
      Port: 80
      Protocol: HTTP
      DefaultActions:
        - Type: forward
          TargetGroupArn: !Ref AlbTargetGroup

  WafAlbAssociation:
    Type: AWS::WAFv2::WebACLAssociation
    Properties:
      ResourceArn: !Ref ApplicationLoadBalancer
      WebACLArn: !GetAtt WafWebAcl.Arn

Outputs:
  AlbUrl:
    Description: ALB endpoint URL
    Value: !Sub 'http://${ApplicationLoadBalancer.DNSName}'

  AlbArn:
    Description: Application Load Balancer ARN
    Value: !Ref ApplicationLoadBalancer

  TargetGroupArn:
    Description: ALB Target Group ARN
    Value: !Ref AlbTargetGroup

  VpcId:
    Description: VPC ID for the ALB
    Value: !Ref AlbVpc
```

Create `cli/extensions/alb/README.md`:

```markdown
# ALB Extension

Adds an Application Load Balancer with VPC and HTTP
listener. Use when you need:

- Request timeouts longer than 29 seconds
- Response payloads larger than 10 MB
- Streaming responses
- WebSocket connections
- High-throughput workloads that benefit from ALB's
  LCU pricing model over API Gateway's per-request
  pricing

## Usage

    boa extend alb
    boa deploy

## What It Creates

- VPC with 2 public subnets and internet gateway
- Application Load Balancer (HTTP listener)
- Lambda target group
- WAF association moves from API Gateway to ALB
- Reserved concurrency restored (50)

## Limitations

- HTTP only by default. HTTPS requires an ACM certificate
  and a custom domain. Chrome HTTPS-First mode will cause
  fetch failures from HTTPS frontends.
- `apiUrl` changes from HTTPS (API Gateway) to HTTP (ALB).
  Update your frontend configuration after switching.
```

### Extension Registry (`cli/lib/extensions.mjs`)

Register `alb` in `getRegistry()`:

```javascript
export function getRegistry() {
  return {
    'api-gateway': {
      description: 'API Gateway REST (now the default)',
      deprecated: true,
      fragmentPath: null,
    },
    'alb': {
      description: 'ALB + VPC + HTTP listener for long requests or streaming',
      fragmentPath: join(EXTENSIONS_DIR, 'alb', 'fragment.yaml'),
    },
  };
}
```

Replace the existing `api-gateway` transform in
`mergeTemplate()` (lines 58-121) with an `alb` transform
that is the symmetric inverse:

```javascript
if (extensions.includes('alb')) {
  // Remove API Gateway resources
  const baseResources = doc.get('Resources', true);
  baseResources.delete('Api');
  baseResources.delete('WafApiGatewayAssociation');

  // Remove Events from ApiFunction
  const apiProps = doc.getIn(
    ['Resources', 'ApiFunction', 'Properties'], true,
  );
  apiProps.delete('Events');

  // Restore reserved concurrency
  apiProps.set(
    'ReservedConcurrentExecutions', doc.createNode(50),
  );

  // Flip env vars to ALB DNS
  const apiEnvVars = doc.getIn(
    ['Resources', 'ApiFunction', 'Properties',
     'Environment', 'Variables'], true,
  );
  apiEnvVars.set('BETTER_AUTH_URL', doc.createNode({
    'Fn::Sub':
      'http://${ApplicationLoadBalancer.DNSName}',
  }));
  apiEnvVars.set('API_BASE_URL', doc.createNode({
    'Fn::Sub':
      'http://${ApplicationLoadBalancer.DNSName}/rest/v1',
  }));

  // Remove API Gateway outputs
  const baseOutputs = doc.get('Outputs', true);
  baseOutputs.delete('ApiGatewayUrl');
  baseOutputs.delete('RestApiId');
}
```

Handle the `api-gateway` deprecated alias. This check
belongs in `mergeTemplate()` so it is a no-op at the
template level. The user-facing deprecation message is
printed by `commands/extend.mjs` (see below), not here:

```javascript
if (extensions.includes('api-gateway')) {
  // No-op: api-gateway is now the default.
  // Filter it out so the merge proceeds normally.
  const filtered = extensions.filter(
    e => e !== 'api-gateway'
  );
  if (filtered.length === 0) return baseText;
  // Continue merge with remaining extensions
}
```

In `commands/extend.mjs`, add a special case before the
registry validation:

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

### Deploy Migration Guard (`cli/commands/deploy.mjs`)

Update `needsMigrationWarning()` (lines 13-33). The
existing function warns when the API URL pattern does not
match the current default. With the default flipped, the
inverse case is: a project with `cfg.alb` deploying
against a template that no longer has ALB.

```javascript
export function needsMigrationWarning(cfg) {
  const extensions = cfg.extensions || [];
  // Legacy ALB project deploying against new default
  if (cfg.alb && !extensions.includes('alb')) {
    return 'This project uses ALB as the traffic layer'
      + ' (legacy default). Keeping ALB.';
  }
  // CloudFront -> API Gateway migration
  if (cfg.cloudfront && !cfg.apiGateway) {
    return 'This version of BOA uses API Gateway REST'
      + ' + WAF by default instead of CloudFront.';
  }
  // Function URL -> API Gateway migration
  if (cfg.apiUrl
      && cfg.apiUrl.includes('lambda-url.')
      && !cfg.apiGateway) {
    return 'This version of BOA uses API Gateway REST'
      + ' + WAF by default.';
  }
  return null;
}
```

When `cfg.alb` exists and is not in the `extensions` array,
the deploy command auto-applies the ALB extension to keep
the project on ALB without a silent swap:

```javascript
// In deploy(), after needsMigrationWarning():
if (cfg.alb && !extensions.includes('alb')) {
  // Legacy ALB project: apply alb extension
  // automatically to preserve the existing traffic layer
  extensions.push('alb');
}
```

### Init Changes (`cli/commands/init.mjs`)

**Line 23-24 (template path):** No change needed. The
default `TEMPLATE_PATH` already points to the bundled
`backend.yaml`, which will now contain API Gateway.

**Lines 382-391 (output extraction):** Replace ALB outputs
with API Gateway outputs:

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

**Lines 405-424 (config write):** Replace `alb` block with
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

**Line 94 (`generateClaudeMd()`):** Update architecture
diagram:

```
ALB + WAF (DDoS protection, rate limiting)
```
becomes:
```
API Gateway REST + WAF (HTTPS, rate limiting)
```

**Line 241 (config comment):** Change
`apiUrl: ... (ALB endpoint, primary entry point)` to
`apiUrl: ... (API Gateway endpoint, primary entry point)`.

### Deploy Changes (`cli/commands/deploy.mjs`)

**Lines 88-95 (output extraction):** Extract API Gateway
outputs instead of ALB:

```javascript
const apiGatewayUrl = getOutputValue(
  outputs, 'ApiGatewayUrl'
);
const restApiId = getOutputValue(outputs, 'RestApiId');
let apiUrl = apiGatewayUrl;
const bucketName = getOutputValue(outputs, 'BucketName');
const dsqlEndpoint = getOutputValue(
  outputs, 'DsqlEndpoint'
);
```

**Lines 104-135 (config write):** Replace `alb` block with
`apiGateway` block in the default path. When `alb`
extension is active, extract ALB outputs and set the `alb`
block:

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

### Verify Changes (`cli/commands/verify.mjs`)

Add `shellEscape` to the import from `../lib/aws.mjs`
(matching the pattern in `teardown.mjs`).

**Lines 55-103 (ALB checks):** Move ALB checks behind
`cfg.alb` (already done). Add API Gateway checks when
`cfg.apiGateway` is present:

```javascript
if (cfg.apiGateway) {
  // Check: API Gateway stage exists
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

  // Check: WAF attached to API Gateway stage
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

**Line 118 (API responding message):** Change from
"API is responding through ALB" to "API is responding".

**Lines 166-182 (reserved concurrency check):** Only check
when `cfg.alb` is present. API Gateway has its own
throttling:

```javascript
if (cfg.alb) {
  console.log('Checking Lambda concurrency...');
  // ... existing check ...
}
```

### Status Changes (`cli/commands/status.mjs`)

**Lines 21-23:** Replace ALB line with API Gateway line:

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

### Teardown Changes (`cli/commands/teardown.mjs`)

No significant changes. The default path already deletes
the CloudFormation stack via `sam.remove()`, which handles
all resources in the stack. Without a VPC in the default
template, teardown is simpler (no VPC dependencies to
worry about).

### Config Shape (New Default)

Default init writes `apiGateway` block, no `alb` block:

```json
{
  "stackName": "my-app",
  "region": "us-east-1",
  "accountId": "123456789012",
  "apiUrl": "https://abc123.execute-api.us-east-1.amazonaws.com/prod",
  "apiGateway": {
    "restApiId": "abc123",
    "stage": "prod"
  },
  "anonKey": "eyJ...",
  "serviceRoleKey": "eyJ...",
  "authProvider": "better-auth",
  "pgrestLambdaVersion": "x.y.z",
  "bucketName": "my-app-storage-123456789012",
  "dsqlEndpoint": "abc123.dsql.us-east-1.on.aws",
  "deployedAt": "2026-04-27T00:00:00.000Z",
  "extensions": []
}
```

When `alb` extension is enabled:

```json
{
  "apiUrl": "http://my-app-alb-xxx.us-east-1.elb.amazonaws.com",
  "alb": {
    "arn": "arn:aws:elasticloadbalancing:...",
    "dnsName": "my-app-alb-xxx.us-east-1.elb.amazonaws.com",
    "targetGroupArn": "arn:aws:elasticloadbalancing:...",
    "vpcId": "vpc-abc123"
  },
  "extensions": ["alb"]
}
```

Existing configs with `alb` block and no `extensions` array
continue to load (the `extensions || []` fallback is
already in all CLI commands).

### pgrest-lambda Contract

No changes needed. The `pgrest-lambda` handler already
supports both ALB and API Gateway REST event shapes. The
current `api-gateway` extension has been in production use,
confirming the handler works with API Gateway events.

## Code Architecture / File Changes

### Modified Files

| File | Change |
|------|--------|
| `cli/templates/backend.yaml` | Replace ALB + VPC (15 resources) with API Gateway REST. Add `Api`, events, WAF stage association. Flip env vars to HTTPS. Remove `ReservedConcurrentExecutions`. Update outputs and description. |
| `cli/lib/extensions.mjs` | Register `alb` extension. Replace `api-gateway` transform with `alb` transform (symmetric inverse). Mark `api-gateway` as deprecated no-op. |
| `cli/commands/init.mjs` | Extract `ApiGatewayUrl` and `RestApiId` instead of ALB outputs. Write `apiGateway` block instead of `alb` block. Update `generateClaudeMd()` architecture diagram. |
| `cli/commands/deploy.mjs` | Update `needsMigrationWarning()` for legacy ALB detection. Extract API Gateway outputs by default. Auto-apply `alb` extension for legacy projects. Write `apiGateway` block. |
| `cli/commands/verify.mjs` | Add API Gateway stage + WAF checks when `cfg.apiGateway` present. Skip ALB + concurrency checks when `cfg.alb` absent. Update success message text. |
| `cli/commands/status.mjs` | Print `API Gateway:` line when `cfg.apiGateway` present. Keep `ALB:` line for legacy. |
| `cli/__tests__/template-structure.test.mjs` | Assert base template has `AWS::Serverless::Api`, not `ElasticLoadBalancingV2::LoadBalancer`. |
| `cli/__tests__/extensions.test.mjs` | Replace `api-gateway` extension tests with `alb` extension tests. Base template now has `Api`. |
| `cli/__tests__/extend-command.test.mjs` | Update extension name in tests from `api-gateway` to `alb`. |
| `cli/__tests__/remove-command.test.mjs` | Update extension name references. |
| `cli/__tests__/extensions-list-command.test.mjs` | Assert `alb` appears; `api-gateway` listed as deprecated. |
| `cli/__tests__/deploy-migration.test.mjs` | Update migration warning tests for new detection logic. |
| `plugin/CLAUDE.md` | API row: `API Gateway REST + WAF (default)`. Update paragraph about extensions. |
| `plugin/skills/boa/SKILL.md` | Description, ASCII diagram, traffic-layer prose, extensions section. |
| `plugin/docs/PITFALLS.md` | Rewrite pitfall #25 (HTTP/HTTPS). New lead: "Failed to fetch / silent network errors on HTTP APIs." Root cause: Chrome HTTPS-First. Resolution: API Gateway is now the default; only add ALB with ACM cert. |
| `plugin/docs/API-PATTERNS.md` | Default traffic layer is API Gateway REST + WAF. ALB available as extension. |
| `plugin/docs/AUTH-PATTERNS.md` | Replace ALB URL references in examples with API Gateway URL. |
| `plugin/docs/STORAGE-PATTERNS.md` | Replace ALB URL references with API Gateway URL where describing the default. |
| `plugin/docs/REST-API.md` | Update any ALB default references. |
| `plugin/AGENTS.md` | Backend architecture: API Gateway REST + WAF. Keep ALB mention as extension. |
| `plugin/skills/boa-manage/SKILL.md` | Update references to default traffic layer. |
| `CLAUDE.md` | AWS Stack table: API row becomes `API Gateway REST + WAF (default)`. Update text about ALB + WAF. |
| `docs/ARCHITECTURE.md` | Update system diagram and traffic layer section. |
| `docs/PRODUCT.md` | Stack table: ALB + WAF becomes API Gateway REST + WAF. |
| `docs/GLOSSARY.md` | Update extension terminology. ALB is extension, API Gateway is default. |
| `website/scripts/generate-pricing.mjs` | API Gateway is always-on cost for default scenario. ALB behind `extension: alb` scenario. |

### New Files

| File | Purpose |
|------|---------|
| `cli/extensions/alb/fragment.yaml` | ALB + VPC SAM fragment (15 resources + WAF association + 4 outputs) |
| `cli/extensions/alb/README.md` | Extension documentation |

### Unchanged Files

| File | Why |
|------|-----|
| `cli/templates/lambda/index.mjs` | pgrest-lambda already handles API Gateway events |
| `cli/templates/lambda/presigned-upload.mjs` | Receives events via index.mjs routing |
| `cli/commands/teardown.mjs` | `sam.remove()` handles all resources; no VPC cleanup needed in default path |
| `cli/lib/aws.mjs` | No new AWS wrappers needed |
| `cli/lib/sam.mjs` | Build/deploy unchanged |
| `cli/lib/config.mjs` | Reads/writes JSON, schema-agnostic |

## Testing Strategy

### Unit Tests

**`cli/__tests__/template-structure.test.mjs`:**

Replace the "SAM template -- ALB default" suite with
"SAM template -- API Gateway default":

- Base template contains `AWS::Serverless::Api`
- Base template does NOT contain
  `ElasticLoadBalancingV2::LoadBalancer`
- Base template does NOT contain `AWS::EC2::VPC`
- Base template contains `WafApiGatewayAssociation`
  (not `WafAlbAssociation`)
- Base template has `ApiGatewayUrl` and `RestApiId` in
  Outputs
- Base template does NOT have `AlbUrl`, `AlbArn`,
  `TargetGroupArn`, `VpcId` in Outputs
- `ApiFunction` does NOT have
  `ReservedConcurrentExecutions`
- `ApiFunction` has `Events` with `ProxyRoot` and
  `ProxyPlus`
- `BETTER_AUTH_URL` env var contains
  `execute-api` (HTTPS)
- `API_BASE_URL` env var contains `execute-api` (HTTPS)

**`cli/__tests__/extensions.test.mjs`:**

Replace "Template merging -- api-gateway extension" with
"Template merging -- alb extension":

- `mergeTemplate(['alb'])` adds
  `ElasticLoadBalancingV2::LoadBalancer`
- `mergeTemplate(['alb'])` adds VPC resources
- `mergeTemplate(['alb'])` removes `AWS::Serverless::Api`
- `mergeTemplate(['alb'])` removes `Events` from
  `ApiFunction`
- `mergeTemplate(['alb'])` restores
  `ReservedConcurrentExecutions: 50`
- `mergeTemplate(['alb'])` flips `BETTER_AUTH_URL` to
  use ALB DNS (`http://`)
- `mergeTemplate(['alb'])` flips `API_BASE_URL` to use
  ALB DNS
- `mergeTemplate(['alb'])` adds `AlbUrl`, `AlbArn`,
  `TargetGroupArn`, `VpcId` to Outputs
- `mergeTemplate(['alb'])` removes `ApiGatewayUrl` and
  `RestApiId` from Outputs
- `mergeTemplate(['alb'])` adds `WafAlbAssociation` and
  removes `WafApiGatewayAssociation`

Update "Template merging -- base (no extensions)":

- Base template has `AWS::Serverless::Api` (was: no Api)
- Base template has `ApiGatewayUrl` output (was: `AlbUrl`)

Add "Template merging -- api-gateway deprecated":

- `mergeTemplate(['api-gateway'])` returns base template
  unchanged (no-op)

**`cli/__tests__/extend-command.test.mjs`:**

Update the "already enabled" test to use `alb` instead
of `api-gateway`. Add a test for the deprecated
`api-gateway` alias message.

**`cli/__tests__/remove-command.test.mjs`:**

Update extension name references from `api-gateway`
to `alb`.

**`cli/__tests__/extensions-list-command.test.mjs`:**

- `alb` appears in available extensions
- `api-gateway` appears with deprecated marker
- When `alb` is enabled, shows `[enabled]` status

**`cli/__tests__/deploy-migration.test.mjs`:**

Update `needsMigrationWarning()` tests:

- Config with `alb` block but no `extensions` array
  triggers legacy ALB warning
- Config with `alb` block AND `extensions: ['alb']`
  does NOT trigger warning
- Config with `apiGateway` block does NOT trigger warning
- Config with `cloudfront` block triggers warning
- Config with `lambda-url` apiUrl triggers warning
- Config with no apiUrl does NOT trigger warning

### Integration Tests (Manual)

**Phase A: Fresh Deploy**

1. `boa init test-apigw --region us-east-1`
2. Verify `apiUrl` starts with `https://` and contains
   `execute-api`
3. Verify `.boa/config.json` has `apiGateway` block, no
   `alb` block
4. `boa verify` passes all checks
5. `boa status` shows `API Gateway:` line

**Phase B: Frontend Fetch**

6. Create minimal HTML page that fetches `apiUrl/rest/v1/`
7. Serve over HTTPS (e.g., `npx serve --ssl`)
8. Verify fetch succeeds (HTTP 401, not network error)
9. This is the core test: the HTTPS-First problem is gone

**Phase C: ALB Extension**

10. `boa extend alb` and `boa deploy`
11. Verify `apiUrl` is HTTP (ALB DNS)
12. Verify `.boa/config.json` has `alb` block
13. `boa verify` runs ALB-specific checks
14. `boa remove alb` and `boa deploy`
15. Verify `apiUrl` reverts to HTTPS (API Gateway)

**Phase D: Legacy Project**

16. Manually create `.boa/config.json` with `alb` block
    and no `extensions` array (simulating pre-change
    project)
17. `boa deploy`
18. Verify warning message about legacy ALB
19. Verify ALB is preserved (no silent swap)

**Phase E: WAF Validation**

20. After fresh deploy, verify WAF stage-ARN association:
    ```bash
    aws wafv2 get-web-acl-for-resource \
      --resource-arn \
        "arn:aws:apigateway:us-east-1::/restapis/<id>/stages/prod" \
      --region us-east-1
    ```
21. Confirm the response includes the WebACL ARN

### Test Specificity Notes

- Template structure tests check for the presence/absence
  of specific CloudFormation resource types. These are
  deterministic given the YAML content.
- Extension merge tests verify resource addition/removal
  after YAML round-trip. CloudFormation tag preservation
  is already covered by existing tests.
- Deploy migration tests call `needsMigrationWarning()`
  with synthetic config objects. No AWS calls needed.
- The WAF stage-ARN association format
  (`arn:aws:apigateway:${Region}::/restapis/${Api}/stages/prod`)
  must be validated against a live deploy. The double
  colon and missing account ID are legal but easy to get
  wrong. This is the highest-risk part of the template
  change.
- The `alb` extension merge test should verify that
  `WafWebAcl` remains in the merged template (it is in
  the base, not the fragment). If `WafWebAcl` is
  accidentally deleted by the transform, WAF silently
  disappears. Assert its presence explicitly.
- The `verify` WAF check constructs the stage ARN from
  `cfg.apiGateway.restApiId` and `cfg.apiGateway.stage`.
  If config has stale values from a previous deploy, the
  ARN will be wrong and the check will fail with a
  misleading message. The test should verify that `verify`
  reports the constructed ARN in the failure message so
  the user can diagnose the mismatch.

## Implementation Order

### Phase 1: Base Template + ALB Extension

1. Update `cli/templates/backend.yaml`: replace ALB/VPC
   resources with API Gateway REST, WAF stage association,
   flip env vars, update outputs and description.
2. Create `cli/extensions/alb/fragment.yaml` with VPC +
   ALB resources.
3. Create `cli/extensions/alb/README.md`.
4. Update `cli/lib/extensions.mjs`: register `alb`,
   replace `api-gateway` transform with `alb` transform,
   mark `api-gateway` as deprecated.

### Phase 2: CLI Commands

5. Update `cli/commands/init.mjs`: extract API Gateway
   outputs, write `apiGateway` block, update
   `generateClaudeMd()`.
6. Update `cli/commands/deploy.mjs`: update
   `needsMigrationWarning()`, extract API Gateway outputs,
   auto-apply ALB for legacy projects.
7. Update `cli/commands/verify.mjs`: add API Gateway
   checks, conditional ALB/concurrency checks.
8. Update `cli/commands/status.mjs`: conditional
   `API Gateway:` / `ALB:` line.

### Phase 3: Tests

9. Update `cli/__tests__/template-structure.test.mjs`.
10. Update `cli/__tests__/extensions.test.mjs`.
11. Update `cli/__tests__/extend-command.test.mjs`.
12. Update `cli/__tests__/remove-command.test.mjs`.
13. Update `cli/__tests__/extensions-list-command.test.mjs`.
14. Update `cli/__tests__/deploy-migration.test.mjs`.

### Phase 4: Docs + Skill

15. Update `plugin/CLAUDE.md`, `plugin/AGENTS.md`,
    `plugin/skills/boa/SKILL.md`,
    `plugin/skills/boa-manage/SKILL.md`.
16. Update `plugin/docs/PITFALLS.md`,
    `plugin/docs/API-PATTERNS.md`,
    `plugin/docs/AUTH-PATTERNS.md`,
    `plugin/docs/STORAGE-PATTERNS.md`,
    `plugin/docs/REST-API.md`.
17. Update `CLAUDE.md`, `docs/ARCHITECTURE.md`,
    `docs/PRODUCT.md`, `docs/GLOSSARY.md`.
18. Update `website/scripts/generate-pricing.mjs`.

### Phase 5: Validation

19. Deploy a fresh stack and verify WAF stage-ARN
    association resolves.
20. Run the manual integration test plan (Phases A-E).
21. Verify all unit tests pass.

## Open Questions

1. **`api-gateway` extension removal timeline.** The
   deprecated no-op alias is kept for one release. Should
   it print a deprecation warning on `boa extensions`
   output, or just appear with a `(deprecated)` marker?
   Recommendation: `(deprecated)` marker in the list, no
   warning on every `boa extensions` call.

2. **Legacy ALB auto-extension.** When `boa deploy`
   detects a legacy ALB project, should it add `alb` to
   the `extensions` array in config (making the extension
   explicit), or should it silently use the ALB template
   path without modifying config? Adding it to config is
   cleaner (makes the state explicit) but modifies the
   project config as a side effect of deploy.
   Recommendation: add to config and print a message
   explaining the change.
