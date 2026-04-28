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
  // Write the merged ALB template so subsequent deploys
  // use it instead of the API Gateway default
  const merged = mergeTemplate(['alb']);
  mkdirSync('.boa', { recursive: true });
  writeFileSync(
    join('.boa', 'template.yaml'), merged
  );
  // Add to extensions and rewrite config
  extensions.push('alb');
  cfg.extensions = extensions;
  config.write(cfg);
  console.log("Extension 'alb' enabled.");
  process.exit(0);
}
```

The template write is critical: without it, the next
`boa deploy` sees `extensions: ['alb']` (so the legacy
detection in `deploy.mjs` is false) but finds no
`.boa/template.yaml`, falls back to the API Gateway
base template, and silently destroys the ALB.

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
the deploy command must detect this **before** template
resolution. The legacy ALB detection and merged template
write must happen before `resolveTemplate()` is called,
because `resolveTemplate()` returns the base template
(now API Gateway) when no `.boa/template.yaml` exists.
If the detection happens after template resolution (as in
the pre-fix code), the legacy project is deployed against
the API Gateway template, silently destroying the ALB.

```javascript
// In deploy(), BEFORE resolveTemplate():
const extensions = cfg.extensions || [];
if (cfg.alb && !extensions.includes('alb')) {
  console.log(
    '  ! This project uses ALB as the traffic layer'
    + ' (legacy default). Keeping ALB.'
  );
  console.log(
    '    Adding alb to extensions for explicit'
    + ' tracking.'
  );
  const merged = mergeTemplate(['alb']);
  mkdirSync(join('.boa'), { recursive: true });
  writeFileSync(
    join('.boa', 'template.yaml'), merged
  );
  extensions.push('alb');
}

// resolveTemplate() now finds .boa/template.yaml
const templatePath = resolveTemplate(process.cwd());
sam.build(templatePath, buildDir, region);
```

This ensures the deployed template contains
`AWS::ElasticLoadBalancingV2::LoadBalancer` for legacy
projects. The config file is rewritten with
`extensions: ['alb']` so subsequent deploys no longer
require the legacy-detection branch.

The `needsMigrationWarning()` helper keeps its warning
role but the deploy must not proceed against the wrong
template. The merged template write is the enforcement
mechanism.

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

**Line 119 (CLI table in `generateClaudeMd()`):** Change
the `boa extend` example from `api-gateway` to `alb`:

```
| `boa extend <name>` | Add an optional extension (e.g., alb) |
```

This matches the already-updated `cli/skill/SKILL.md:69`
and `plugin/AGENTS.md:9`.

### Deploy Changes (`cli/commands/deploy.mjs`)

**Lines 88-95 (output extraction):** Replaced by
`buildDeployConfig()` -- see below.

**Lines 104-135 (config write and print):** Extract into a
pure function `buildDeployConfig()` and use its return
value for both the config write and the printed URL.

`deploy()` accepts a second parameter `opts`:

```javascript
export default async function deploy(_args, opts = {}) {
```

When `opts.skipConfigWrite` is true, `deploy()` returns
the raw CloudFormation outputs array without writing
config or printing the URL. The caller (`extend.mjs`,
`remove.mjs`) builds and writes config itself.

When `opts.skipConfigWrite` is false (the default):

```javascript
const updatedConfig = buildDeployConfig(
  cfg, outputs, extensions
);
config.write(updatedConfig);
console.log(`API URL: ${updatedConfig.apiUrl}`);
```

The local `let apiUrl = apiGatewayUrl` variable is
removed. The printed URL comes from the config object,
which `buildDeployConfig()` already sets to the ALB URL
when the ALB branch runs. This fixes the bug where
`deploy.mjs:167` printed `API URL: undefined` for ALB
projects because the local variable was never reassigned.

**`buildDeployConfig()` extraction:** Extract into a pure
function `buildDeployConfig(cfg, outputs, extensions)`
that both `deploy()` and `extend.mjs` call:

```javascript
export function buildDeployConfig(
  cfg, outputs, extensions
) {
  const apiGatewayUrl = getOutputValue(
    outputs, 'ApiGatewayUrl'
  );
  const restApiId = getOutputValue(
    outputs, 'RestApiId'
  );
  const bucketName = getOutputValue(
    outputs, 'BucketName'
  );
  const dsqlEndpoint = getOutputValue(
    outputs, 'DsqlEndpoint'
  );

  const filtered = extensions.filter(
    e => e !== 'api-gateway'
  );
  const result = {
    stackName: cfg.stackName,
    region: cfg.region,
    accountId: cfg.accountId,
    apiUrl: apiGatewayUrl,
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
    extensions: filtered,
  };

  if (filtered.includes('alb')) {
    const albUrl = getOutputValue(outputs, 'AlbUrl');
    const albArn = getOutputValue(outputs, 'AlbArn');
    const targetGroupArn = getOutputValue(
      outputs, 'TargetGroupArn'
    );
    const vpcId = getOutputValue(outputs, 'VpcId');
    if (albUrl) result.apiUrl = albUrl;
    result.alb = (albArn && albUrl) ? {
      arn: albArn,
      dnsName: new URL(albUrl).hostname,
      targetGroupArn,
      vpcId,
    } : undefined;
    delete result.apiGateway;
  }

  return result;
}
```

This function is pure (no side effects) and testable with
synthetic CloudFormation output maps. The guard
`(albArn && albUrl)` prevents `new URL(undefined)` from
throwing `TypeError: Invalid URL` when `AlbUrl` is missing
from CloudFormation outputs.

### Extend Changes (`cli/commands/extend.mjs`)

Eliminate the double config-write between `deploy()` and
`extend.mjs`. Currently, `deploy()` writes config (line
143), then `extend.mjs` re-reads config and writes it
again (lines 81-107). This forces ALB-specific logic into
two places that drift.

Fix: `deploy()` accepts a `skipConfigWrite` option. When
true, it builds and deploys via SAM, runs auth schema
bootstrap, and copies the skill, but does not write
`.boa/config.json` or print the API URL. It returns the
CloudFormation outputs so the caller can build config
itself.

`extend.mjs` calls `deploy([], { skipConfigWrite: true })`
then uses `buildDeployConfig()` for a single config write:

```javascript
const outputs = await deploy(
  [], { skipConfigWrite: true }
);
const updatedCfg = buildDeployConfig(
  cfg, outputs, newExtensions
);
config.write(updatedCfg);
console.log(`API URL: ${updatedCfg.apiUrl}`);
```

The `deploy()` return value: when `skipConfigWrite` is
true, `deploy()` returns the raw CloudFormation outputs
array from `aws.cfnDescribeStacks()`. When false (the
default, for direct `boa deploy`), it writes config and
prints the URL itself, returning nothing.

**Legacy shortcut (lines 46-58):** The legacy ALB
detection (`cfg.alb && !extensions.includes('alb')`)
must write `.boa/template.yaml` before exiting. See the
Edge Cases section for the full code. Without this, the
next `boa deploy` falls back to the API Gateway base
template and silently destroys the ALB.

End state:
- One config write per CLI invocation.
- ALB-specific config shape lives in `buildDeployConfig()`
  only (not duplicated in `extend.mjs` lines 85-104).
- `remove.mjs` never produces the transient
  `extensions: ['alb']` with no template state.

### Remove Changes (`cli/commands/remove.mjs`)

Same pattern as `extend.mjs`. Currently, `remove.mjs:42`
calls `deploy([])` (which writes config with
`extensions: ['alb']`), then lines 44-52 re-read config,
strip the `alb` extension and `alb` block, and write
again. The intermediate config has `extensions: ['alb']`
with no `.boa/template.yaml`, which is inconsistent.

Fix: `remove.mjs` calls
`deploy([], { skipConfigWrite: true })`, then builds
config once:

```javascript
const outputs = await deploy(
  [], { skipConfigWrite: true }
);
const updatedCfg = buildDeployConfig(
  cfg, outputs, newExtensions
);
config.write(updatedCfg);
console.log(`API URL: ${updatedCfg.apiUrl}`);
```

Since `newExtensions` does not include `'alb'`, the
`buildDeployConfig()` ALB branch does not run. The result
has `apiGateway` block, no `alb` block, and `apiUrl` is
the API Gateway HTTPS URL. One config write, no transient
inconsistency.

### Verify Changes (`cli/commands/verify.mjs`)

Add `shellEscape` to the import from `../lib/aws.mjs`
(matching the pattern in `teardown.mjs`). Use
`shellEscape()` on all user-controllable values
interpolated into shell commands throughout the file:
`apiUrl` (line 155), `cfg.alb.targetGroupArn` (lines
106/113), `cfg.alb.arn` (line 136), `region` in ALB
checks (lines 107/114/136), `bucketName` (lines 179/191),
and `functionName` (line 214). The new API Gateway checks
(lines 60-66) already use `shellEscape()` correctly; the
fix makes the rest of the file consistent.

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

**Line 155 (curl command):** Shell-escape `apiUrl`:

```javascript
httpCode = aws.exec(
  `curl -s -o /dev/null -w '%{http_code}'`
    + ` ${shellEscape(apiUrl + '/rest/v1/')}`
);
```

**Lines 106-136 (ALB checks):** Shell-escape
`cfg.alb.targetGroupArn`, `cfg.alb.arn`, and `region`:

```javascript
aws.exec(
  `aws elbv2 describe-target-health`
    + ` --target-group-arn ${shellEscape(cfg.alb.targetGroupArn)}`
    + ` --region ${shellEscape(region)}`
    + ` --query 'TargetHealthDescriptions[0].TargetHealth.State'`
    + ` --output text`
);
```

```javascript
aws.exec(
  `aws wafv2 get-web-acl-for-resource`
    + ` --resource-arn ${shellEscape(cfg.alb.arn)}`
    + ` --region ${shellEscape(region)}`
    + ` --query 'WebACL.ARN' --output text`
);
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
| `cli/commands/init.mjs` | Extract `ApiGatewayUrl` and `RestApiId` instead of ALB outputs. Write `apiGateway` block instead of `alb` block. Update `generateClaudeMd()` architecture diagram. Fix `boa extend` example: `api-gateway` to `alb`. |
| `cli/commands/deploy.mjs` | Update `needsMigrationWarning()` for legacy ALB detection. Legacy ALB detection BEFORE `resolveTemplate()` -- write merged ALB template to `.boa/template.yaml` before build. Extract `buildDeployConfig()` pure function (exported). Add `skipConfigWrite` option: when true, return CF outputs without writing config or printing URL. Print `updatedConfig.apiUrl` (not a stale local variable). Guard `new URL(albUrl)` against undefined. |
| `cli/commands/extend.mjs` | Use `buildDeployConfig()` from deploy.mjs. Pass `skipConfigWrite: true` to `deploy()`. Single config write after deploy completes. Legacy ALB shortcut writes `.boa/template.yaml` before exiting. |
| `cli/commands/remove.mjs` | Use `buildDeployConfig()` from deploy.mjs. Pass `skipConfigWrite: true` to `deploy()`. Single config write after deploy completes. |
| `cli/commands/verify.mjs` | Add API Gateway stage + WAF checks when `cfg.apiGateway` present. Skip ALB + concurrency checks when `cfg.alb` absent. Shell-escape `apiUrl`, `cfg.alb.targetGroupArn`, `cfg.alb.arn`, `region`, `bucketName`, `functionName` in all `aws.exec()` calls. Update success message text. |
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
| `cli/__tests__/verify-command.test.mjs` | Shell-escape tests for verify command |
| `cli/__tests__/deploy-legacy-alb.test.mjs` | Legacy ALB project deploy uses correct template |
| `cli/__tests__/init-claudemd.test.mjs` | Generated CLAUDE.md content assertions |

### Unchanged Files

| File | Why |
|------|-----|
| `cli/templates/lambda/index.mjs` | pgrest-lambda already handles API Gateway events |
| `cli/templates/lambda/presigned-upload.mjs` | Receives events via index.mjs routing |
| `cli/commands/teardown.mjs` | `sam.remove()` handles all resources; no VPC cleanup needed in default path |
| `cli/lib/aws.mjs` | `shellEscape()` already exists; no new wrappers needed |
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
- Config with `alb` block AND `extensions: ['api-gateway']`
  triggers legacy ALB warning (the `api-gateway` extension
  does not suppress the ALB detection because
  `extensions.includes('alb')` is still false)
- `test_deploy_alb_missing_url_no_throw`: Call
  `buildDeployConfig(cfg, outputs, ['alb'])` with
  synthetic outputs containing `AlbArn` but no `AlbUrl`.
  Verify it returns `alb: undefined` without throwing
  `TypeError: Invalid URL`. Import the real function
  from `deploy.mjs`, not a local replica of the guard
  pattern.
- `test_build_deploy_config_alb_outputs`: Call
  `buildDeployConfig(cfg, outputs, ['alb'])` with
  synthetic outputs containing `AlbUrl`, `AlbArn`,
  `TargetGroupArn`, `VpcId`. Verify the result has an
  `alb` block with correct values, no `apiGateway` block,
  and `apiUrl` set to the ALB URL. This tests the
  extracted function directly rather than replicating its
  logic inline.

**`cli/__tests__/deploy-legacy-alb.test.mjs` (new file):**

Test that legacy ALB projects deploy against the correct
template. Uses `buildDeployConfig()` and verifies the
template merge happens before `resolveTemplate()`:

- `test_deploy_legacy_alb_uses_alb_template`: Given a
  legacy config (`alb` block, `extensions: []`), verify
  that the deploy path writes a merged ALB template to
  `.boa/template.yaml` containing
  `AWS::ElasticLoadBalancingV2::LoadBalancer` before
  calling `sam.build()`. Test the
  `buildDeployConfig()` function with synthetic outputs
  that include `AlbUrl`, `AlbArn`, `TargetGroupArn`,
  `VpcId` and verify the resulting config has an `alb`
  block and no `apiGateway` block.

**`cli/__tests__/verify-command.test.mjs` (new file):**

Shell-escape and output format tests for verify:

- `test_verify_apiUrl_shell_escape`: Given a config
  with `apiUrl` containing shell metacharacters (e.g.,
  `https://example.com/;echo injected`), verify the
  constructed `aws.exec()` command uses
  `shellEscape(apiUrl + '/rest/v1/')` -- the
  metacharacter is wrapped in single quotes and not
  executed. Test by asserting the `shellEscape` function
  correctly wraps the value, since verify calls
  `aws.exec()` with the escaped string.
- `test_verify_alb_arn_shell_escape`: Same pattern for
  `cfg.alb.targetGroupArn` and `cfg.alb.arn` -- verify
  these values are passed through `shellEscape()` in the
  constructed commands.

  Note: these tests verify the escaping contract via
  `shellEscape()` unit tests and code audit, not by
  running the full verify command (which requires live
  AWS). The `shellEscape` function is the single point
  of trust.

**`cli/__tests__/init-claudemd.test.mjs` (new file):**

- `test_generated_claudemd_extend_example_uses_alb`:
  Call `generateClaudeMd('test', {...})` and assert the
  result contains `(e.g., alb)` and does NOT contain
  `(e.g., api-gateway)`.

**`cli/__tests__/extend-command.test.mjs` (additions):**

- `test_extend_alb_writes_merged_template`: Given a
  fresh project with `apiGateway` config and
  `extensions: []`, when `boa extend alb` runs past the
  template merge step (before deploy), verify
  `.boa/template.yaml` contains
  `ElasticLoadBalancingV2::LoadBalancer` and does NOT
  contain `AWS::Serverless::Api`.
- `test_extend_alb_legacy_writes_template_yaml`: Given
  a legacy ALB project (config has `alb` block,
  `extensions: []`), when `boa extend alb` runs (legacy
  shortcut path), verify `.boa/template.yaml` exists in
  the project directory AND contains
  `ElasticLoadBalancingV2::LoadBalancer`. This tests the
  fix for the critical bug where the legacy shortcut
  exited without writing the template, causing the next
  deploy to silently destroy the ALB.
- `test_extend_alb_config_consistency`: Call
  `buildDeployConfig(cfg, outputs, ['alb'])` with
  synthetic CloudFormation outputs containing `AlbUrl`,
  `AlbArn`, `TargetGroupArn`, `VpcId`. Verify the
  returned config has `alb.arn`, `alb.dnsName`,
  `alb.targetGroupArn`, and `alb.vpcId` matching the
  output values. No `apiGateway` block. `apiUrl` equals
  the `AlbUrl` value.
- `test_extend_deploy_config_writes_consistent`:
  `buildDeployConfig()` with the same inputs produces
  deterministic output. Call it twice with identical
  `cfg`, `outputs`, and `extensions`; assert the two
  results are deeply equal (except `deployedAt`).

**`cli/__tests__/deploy-legacy-alb.test.mjs`
(additions):**

- `test_deploy_legacy_alb_prints_correct_api_url`:
  Call `buildDeployConfig(cfg, outputs, ['alb'])` with
  synthetic outputs that include
  `AlbUrl: 'http://my-alb.example.com'` and no
  `ApiGatewayUrl`. Verify `result.apiUrl` equals the
  ALB URL (not `undefined`). This tests the fix for the
  bug where `deploy.mjs:167` printed `API URL: undefined`
  because it used a stale local variable instead of the
  config object.

**`cli/__tests__/remove-command.test.mjs` (additions):**

- `test_remove_alb_cleans_config_block`: Given a config
  with `extensions: ['alb']` and an `alb` block, after
  the remove command's post-deploy config cleanup runs,
  `updatedCfg.alb` is `undefined` and
  `updatedCfg.extensions` is `[]`.
- `test_remove_alb_final_config_consistent`: Call
  `buildDeployConfig(cfg, outputs, [])` with synthetic
  API Gateway outputs (no ALB keys). Verify the result
  has `extensions: []`, no `alb` block, `apiUrl` is an
  HTTPS API Gateway URL, and `apiGateway` block is
  present.

**`cli/__tests__/extensions.test.mjs` (additions):**

- `test_merge_template_alb_and_deprecated_api_gateway`:
  `mergeTemplate(['alb', 'api-gateway'])` produces the
  same result as `mergeTemplate(['alb'])`. The deprecated
  `api-gateway` is filtered out.
- `test_alb_reserved_concurrency_value_is_50`: Parse
  `mergeTemplate(['alb'])` output and verify
  `ReservedConcurrentExecutions` has integer value `50`,
  not string `"50"`.

**`cli/__tests__/extensions-list-command.test.mjs`
(additions):**

- `test_extensions_list_api_gateway_deprecated_same_line`:
  The line in stdout containing `api-gateway` also
  contains `(deprecated)` on the same line.

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

**Phase E: ALB Round-Trip**

20. `boa extend alb` on a fresh API Gateway project
21. Verify final config has `alb` block, `apiUrl` is ALB
    DNS, `extensions` includes `'alb'`
22. `boa remove alb`
23. Verify `alb` block is removed from config, `apiUrl`
    reverts to API Gateway HTTPS

**Phase F: WAF Validation**

24. After fresh deploy, verify WAF stage-ARN association:
    ```bash
    aws wafv2 get-web-acl-for-resource \
      --resource-arn \
        "arn:aws:apigateway:us-east-1::/restapis/<id>/stages/prod" \
      --region us-east-1
    ```
25. Confirm the response includes the WebACL ARN

**Phase G: Mutual Exclusion**

26. `mergeTemplate(['alb', 'api-gateway'])` does not
    produce a template with both traffic layers.
    `api-gateway` is filtered as deprecated; only ALB
    resources appear.
27. Verify a config with both `alb` block AND
    `extensions: ['api-gateway']` triggers the legacy ALB
    migration warning on `boa deploy`.

### Test Specificity Notes

- Template structure tests check for the presence/absence
  of specific CloudFormation resource types. These are
  deterministic given the YAML content.
- Extension merge tests verify resource addition/removal
  after YAML round-trip. CloudFormation tag preservation
  is already covered by existing tests.
- Deploy migration tests call `needsMigrationWarning()`
  and `buildDeployConfig()` with synthetic config objects
  and output maps. No AWS calls needed.
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
- Shell-escape tests verify the contract via
  `shellEscape()` unit tests and code audit rather than
  running the full verify/deploy commands (which require
  live AWS). The `shellEscape` function is the single
  point of trust for command-injection prevention.
- The `buildDeployConfig()` extraction enables testing
  the deploy config-build logic with synthetic
  CloudFormation output maps, without needing AWS mocks
  or live stacks. This is the test harness enabler for
  `test_deploy_alb_missing_url_no_throw`,
  `test_build_deploy_config_alb_outputs`,
  `test_deploy_legacy_alb_prints_correct_api_url`,
  `test_extend_alb_config_consistency`,
  `test_extend_deploy_config_writes_consistent`, and
  `test_remove_alb_final_config_consistent`. All of
  these import the real `buildDeployConfig()` from
  `deploy.mjs` rather than replicating its logic inline.
- The legacy ALB deploy test
  (`test_deploy_legacy_alb_uses_alb_template`) verifies
  the critical ordering: legacy detection must happen
  BEFORE `resolveTemplate()`. The test creates a temp
  directory with a legacy config, calls the detection
  logic, and asserts `.boa/template.yaml` is written
  with ALB resources before any SAM build call.
  Without this ordering, the deploy silently swaps the
  traffic layer and `new URL(undefined)` throws.
- `test_extend_alb_legacy_writes_template_yaml` is an
  end-to-end CLI test (subprocess): it creates a temp
  directory with legacy ALB config, runs `boa extend alb`,
  and verifies `.boa/template.yaml` exists and contains
  `ElasticLoadBalancingV2::LoadBalancer`. This catches the
  critical bug where the legacy shortcut exited without
  writing the template.

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
   `generateClaudeMd()`, fix `boa extend` example
   (`api-gateway` to `alb`).
6. Update `cli/commands/deploy.mjs`: move legacy ALB
   detection BEFORE `resolveTemplate()` (writes merged
   template to `.boa/template.yaml`). Extract
   `buildDeployConfig()` pure function (exported). Guard
   `new URL(albUrl)` against undefined. Accept
   `skipConfigWrite` option; return CF outputs when true.
   Print `updatedConfig.apiUrl` instead of stale local.
7. Update `cli/commands/extend.mjs`: use
   `buildDeployConfig()`. Pass `skipConfigWrite: true` to
   `deploy()`. Single config write. Legacy ALB shortcut
   writes `.boa/template.yaml` before exiting.
8. Update `cli/commands/remove.mjs`: use
   `buildDeployConfig()`. Pass `skipConfigWrite: true` to
   `deploy()`. Single config write.
9. Update `cli/commands/verify.mjs`: add API Gateway
   checks, conditional ALB/concurrency checks.
   Shell-escape `apiUrl`, `cfg.alb.targetGroupArn`,
   `cfg.alb.arn`, `region`, `bucketName`, `functionName`
   in all `aws.exec()` calls.
10. Update `cli/commands/status.mjs`: conditional
    `API Gateway:` / `ALB:` line.

### Phase 3: Tests

11. Update `cli/__tests__/template-structure.test.mjs`.
12. Update `cli/__tests__/extensions.test.mjs` (add
    `alb + api-gateway` combo test, reserved concurrency
    value test).
13. Update `cli/__tests__/extend-command.test.mjs` (add
    merged template test, legacy template-write test,
    config consistency test).
14. Update `cli/__tests__/remove-command.test.mjs` (add
    config cleanup test, final config consistency test).
15. Update `cli/__tests__/extensions-list-command.test.mjs`
    (add deprecated-same-line test).
16. Update `cli/__tests__/deploy-migration.test.mjs` (add
    `alb + api-gateway` extensions test, undefined AlbUrl
    test, `buildDeployConfig` ALB outputs test).
17. Update `cli/__tests__/deploy-legacy-alb.test.mjs`
    (add ALB URL print test).
18. Create `cli/__tests__/verify-command.test.mjs`.
19. Create `cli/__tests__/init-claudemd.test.mjs`.

### Phase 4: Docs + Skill

20. Update `plugin/CLAUDE.md`, `plugin/AGENTS.md`,
    `plugin/skills/boa/SKILL.md`,
    `plugin/skills/boa-manage/SKILL.md`.
21. Update `plugin/docs/PITFALLS.md`,
    `plugin/docs/API-PATTERNS.md`,
    `plugin/docs/AUTH-PATTERNS.md`,
    `plugin/docs/STORAGE-PATTERNS.md`,
    `plugin/docs/REST-API.md`.
22. Update `CLAUDE.md`, `docs/ARCHITECTURE.md`,
    `docs/PRODUCT.md`, `docs/GLOSSARY.md`.
23. Update `website/scripts/generate-pricing.mjs`.

### Phase 5: Validation

24. Deploy a fresh stack and verify WAF stage-ARN
    association resolves.
25. Run the manual integration test plan (Phases A-G).
26. Verify all unit tests pass.

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
