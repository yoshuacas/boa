# CloudFront + WAF Default Traffic Layer

## Overview

Add CloudFront + WAF as the default traffic layer for every
BOA backend. The current architecture exposes Lambda Function
URLs with `AuthType: NONE` directly to the public internet
with zero cost protection -- no rate limiting, no DDoS
absorption, no concurrency cap. Every request invokes Lambda
and costs money. AWS has no automatic spending hard cap. This
is a denial-of-wallet (DoW) vulnerability.

CloudFront pay-as-you-go with the always-free tier (10M
requests + 1 TB transfer/month, perpetual, all accounts)
provides DDoS absorption, WAF rate limiting, and edge caching
at $0 for most small apps. Combined with Lambda reserved
concurrency and a CloudWatch throttle alarm, this creates a
three-layer defense that aligns with BOA's "free until your
users show up" constraint.

**Alternatives considered:**

- API Gateway REST ($3.50/1M requests, 12-month free tier
  only). Remains available as `boa extend api-gateway` for
  teams needing usage plans and API keys.
- Application Load Balancer ($16.43/month fixed + LCU,
  12-month free tier only). Available as `boa extend alb`.
- Both replace CloudFront when activated. They are mutually
  exclusive traffic layers.

**Chosen approach:** CloudFront pay-as-you-go + WAF + Lambda
reserved concurrency as the default for every `boa init`
deployment.

**Pricing summary:**

| Service | Cost | Free Tier |
|---------|------|-----------|
| CloudFront | $1.00/1M HTTPS requests + $0.085/GB transfer | 10M requests + 1 TB/month (perpetual) |
| WAF | $5/month web ACL + $1/rule/month + $0.60/1M requests | None |
| Lambda | Unchanged (per-invocation) | 1M requests + 400K GB-s/month |

WAF adds ~$7/month base cost. This is the price of DoW
protection. The alternative is unbounded Lambda bills from a
single attacker.

## Current CX / Concepts

### Current Architecture

The SAM template (`cli/templates/backend.yaml`, lines 101-163)
deploys an `ApiFunction` with `FunctionUrlConfig` set to
`AuthType: NONE`. Two `AWS::Lambda::Permission` resources
(lines 169-183) grant public invoke access:

- `ApiFunctionUrlPermission`: `lambda:InvokeFunctionUrl` with
  `Principal: *` and `FunctionUrlAuthType: NONE`
- `ApiFunctionInvokePermission`: `lambda:InvokeFunction` with
  `Principal: *` and `InvokedViaFunctionUrl: true`

The Function URL is directly accessible. Any HTTP client can
invoke the Lambda function without authentication at the
infrastructure level. pgrest-lambda handles JWT validation
internally, but every request -- valid or not -- invokes
Lambda and incurs compute cost.

### Current Config Format

`.boa/config.json` stores the Function URL as `apiUrl`:

```json
{
  "stackName": "my-app",
  "region": "us-east-1",
  "accountId": "123456789012",
  "apiUrl": "https://abc123.lambda-url.us-east-1.on.aws/",
  "anonKey": "eyJ...",
  "serviceRoleKey": "eyJ...",
  "extensions": []
}
```

Frontend apps use `apiUrl` from this file. The raw Function
URL is the only entry point.

### Current Verification Checks

`cli/commands/verify.mjs` runs 6 checks:

1. Cognito self-signup enabled
2. Function URL has `lambda:InvokeFunctionUrl` permission
3. Function URL has `lambda:InvokeFunction` permission
4. API endpoint responding (HTTP 200/401/404)
5. S3 bucket exists
6. S3 Block Public Access enabled

There are no checks for DDoS protection, rate limiting, or
concurrency limits.

### Current Extension System

`cli/lib/extensions.mjs` supports template fragment merging.
The `api-gateway` extension adds API Gateway REST resources
and injects `Events` into `ApiFunction`. The `resolveTemplate`
function checks for `.boa/template.yaml` (merged template)
before falling back to the bundled default.

Extensions currently add resources to the base template. With
CloudFront as the default, extensions that replace the traffic
layer will need to remove CloudFront resources in addition to
adding their own.

### Skill Documentation

`plugin/skills/boa/SKILL.md` line 3 describes the stack as
"Lambda (Function URLs)". The architecture diagram (lines
32-41) shows `Lambda Function URL` connecting directly to the
pgrest-lambda engine. Critical rule 12 (line 105) says
"Extensions are optional."

`plugin/CLAUDE.md` lists the API layer as "Lambda Function
URLs (free)" and notes API Gateway as an extension.

## Proposed CX / CX Specification

### Default Deployment

After this change, `boa init` creates a backend where all
client traffic flows through CloudFront:

```
Client App (React/Next.js/Vue)
    |
CloudFront + WAF (DDoS protection, rate limiting, edge cache)
    |
Lambda Function URL (AuthType: AWS_IAM, not public)
    |
pgrest-lambda engine (handles JWT + CORS + routing)
```

The API URL format changes from:
```
https://abc123.lambda-url.us-east-1.on.aws/
```
to:
```
https://d111111abcdef8.cloudfront.net
```

Frontend apps using `@supabase/supabase-js` continue to work
-- they reference the URL from `.boa/config.json` which now
points to CloudFront.

Direct access to the Function URL returns HTTP 403 because
`AuthType: AWS_IAM` requires a SigV4 signature that only
CloudFront provides via OAC.

### Config Format

`.boa/config.json` changes:

```json
{
  "stackName": "my-app",
  "region": "us-east-1",
  "accountId": "123456789012",
  "apiUrl": "https://d111111abcdef8.cloudfront.net",
  "functionUrl": "https://abc123.lambda-url.us-east-1.on.aws/",
  "cloudfront": {
    "distributionId": "E1234567890ABC",
    "domainName": "d111111abcdef8.cloudfront.net"
  },
  "anonKey": "eyJ...",
  "serviceRoleKey": "eyJ...",
  "extensions": []
}
```

- `apiUrl` is the CloudFront domain (primary entry point for
  clients).
- `functionUrl` is the raw Function URL (reference only, never
  shared with clients).
- `cloudfront` object stores distribution metadata.

### `boa init` Output

```
Creating stack 'my-app' in us-east-1...

Building SAM application...
  ...SAM build output...

Deploying...
  ...SAM deploy output...

Extracting stack outputs...
Generating BOA keys...

Configuration written to .boa/config.json

Your backend is live:
  API URL:      https://d111111abcdef8.cloudfront.net
  Function URL: https://abc123.lambda-url.us-east-1.on.aws/ (internal)
```

### `boa deploy` Output

Same output extraction. The deploy command extracts both the
CloudFront URL and Function URL from CloudFormation outputs.

### `boa verify` Updated Checks

The verify command replaces the 2 public permission checks
with 5 new checks (9 total for us-east-1, 8 for us-east-2
where WAF is not deployed):

```
BOA Verification

  Stack:  my-app
  Region: us-east-1

Checking Cognito configuration...
  [PASS] Cognito self-signup enabled

Checking CloudFront distribution...
  [PASS] CloudFront distribution is deployed
  [PASS] WAF WebACL is attached to distribution

Checking Function URL permissions...
  [PASS] CloudFront has lambda:InvokeFunctionUrl permission

Checking Function URL access...
  [PASS] Direct Function URL returns 403 (protected by IAM)

Checking API endpoint...
  [PASS] API is responding through CloudFront (HTTP 401)

Checking S3 bucket...
  [PASS] S3 bucket exists
  [PASS] S3 bucket has Block Public Access enabled

Checking Lambda concurrency...
  [PASS] Reserved concurrency is set (50)

======================================
  Results: 9/9 checks passed
  All checks passed
======================================
```

**New check: CloudFront distribution is deployed.**
Uses `aws cloudfront get-distribution --id <distributionId>`
to verify the distribution exists and is in `Deployed` status.
The distribution ID comes from `.boa/config.json`.

Error if distribution not found:
```
  [FAIL] CloudFront distribution is deployed — not found
```

**New check: WAF WebACL is attached.**
Uses `aws wafv2 get-web-acl-for-resource` with the
distribution ARN to verify the WAF association exists.

Error if WAF not attached:
```
  [FAIL] WAF WebACL is attached to distribution — none found
```

**New check: Direct Function URL returns 403.**
Curls the raw Function URL (from `cfg.functionUrl`) and
expects HTTP 403, confirming IAM auth is enforced and the
Function URL is not publicly accessible.

Error if Function URL is publicly accessible:
```
  [FAIL] Direct Function URL returns 403 (protected by IAM)
         — got HTTP 200 (Function URL is publicly accessible!)
```

**New check: Reserved concurrency is set.**
Uses `aws lambda get-function --function-name <name>` and
checks `Concurrency.ReservedConcurrentExecutions`.

Error if not set:
```
  [FAIL] Reserved concurrency is set — not configured
```

**Updated check: Function URL permissions.**
The existing permission checks (checks 2-3) change because
`AuthType` switches from `NONE` to `AWS_IAM`:

- `ApiFunctionUrlPermission` and `ApiFunctionInvokePermission`
  are removed (no public invoke needed).
- `CloudFrontInvokePermission` grants
  `cloudfront.amazonaws.com` the `lambda:InvokeFunctionUrl`
  action.
- The verify command checks for the CloudFront permission
  instead of the public permissions.

```
Checking Function URL permissions...
  [PASS] CloudFront has lambda:InvokeFunctionUrl permission
```

Error:
```
  [FAIL] CloudFront has lambda:InvokeFunctionUrl permission
         — cloudfront.amazonaws.com not in resource policy
```

### `boa status` Updated Output

```
BOA Status

  Stack:       my-app
  Region:      us-east-1
  API URL:     https://d111111abcdef8.cloudfront.net
  Function URL: https://abc123.lambda-url.us-east-1.on.aws/ (internal)
  Deployed at: 2026-04-14T12:00:00Z
  Extensions:  (none)
```

The Function URL is shown with "(internal)" to indicate it
should not be shared with clients.

### Extension Compatibility

Extensions replace the traffic layer. When `boa extend
api-gateway` is run:

1. CloudFront, WAF, OAC, and alarm resources are removed from
   the merged template.
2. API Gateway REST resources are added.
3. `ApiFunction.FunctionUrlConfig.AuthType` reverts to `NONE`
   (API Gateway invokes Lambda directly, not through the
   Function URL).
4. The public invoke permissions are restored.
5. `apiUrl` switches to the API Gateway endpoint.
6. `cloudfront` object is removed from config.

When `boa remove api-gateway` is run, CloudFront is restored
as the default.

`boa extend alb` follows the same pattern: removes CloudFront,
adds ALB resources.

Only one traffic layer is active at a time.

### Validation Rules

1. `apiUrl` in `.boa/config.json` must always point to the
   active traffic layer endpoint (CloudFront by default, API
   Gateway or ALB if an extension overrides it).
2. `functionUrl` is always present in config (reference only).
3. The raw Function URL must never be shared with frontend
   clients.
4. `AuthType: AWS_IAM` on the Function URL is required when
   CloudFront is the traffic layer. Extensions that replace
   CloudFront may change AuthType.

### Error Messages

- **Direct Function URL access:**
  `403 Forbidden` (returned by AWS when SigV4 signature is
  missing). This is expected behavior, not an error.

- **WAF rate limit exceeded:**
  `403 Forbidden` with a WAF-specific response. The request
  never reaches Lambda. The client should implement
  exponential backoff.

- **Lambda throttled (reserved concurrency exceeded):**
  CloudFront returns `502 Bad Gateway` or `503 Service
  Unavailable` (Lambda returns 429, CloudFront translates).
  The CloudWatch alarm fires.

### Cache Behavior

- GET requests are cached at CloudFront edge for 60 seconds.
  Cache key includes `Authorization` header and query string
  so different users and queries get separate cache entries.
- POST, PUT, PATCH, DELETE always forward to origin (no
  caching).
- Developers who need fresh reads can add
  `Cache-Control: no-cache` to the request.
- The 60-second TTL is a safe default for most read-heavy
  apps. It reduces Lambda invocations for repeated reads
  without risking stale writes.

### CORS Behavior

CloudFront passes through CORS headers from the Lambda
response. pgrest-lambda handles CORS internally and returns
appropriate headers. CloudFront does not add or modify CORS
headers unless a response headers policy is configured (none
is used here).

The `FunctionUrlConfig.Cors` block is removed from the
template because it is irrelevant when CloudFront is in
front. While CORS configuration technically works with
`AuthType: AWS_IAM`, browsers never talk to the Function URL
directly -- all viewer requests go through CloudFront.
pgrest-lambda's application-level CORS handling is the sole
source of CORS headers, and CloudFront passes them through
to the viewer.

### Migration Path for Existing Projects

Existing projects deployed with `AuthType: NONE` will switch
to CloudFront on the next `boa deploy` after upgrading the
CLI. The deploy command should warn:

```
Deploying stack 'my-app' in region 'us-east-1'...

  ! This version of boa adds CloudFront + WAF protection.
    Your API URL will change from the raw Function URL to a
    CloudFront domain. Update your frontend config after deploy.
```

This warning is shown when `.boa/config.json` has an `apiUrl`
matching the Function URL pattern (`lambda-url.*.on.aws`) and
no `cloudfront` object in config.

## Technical Design

### SAM Template Changes (`cli/templates/backend.yaml`)

#### Resources to Remove

1. `ApiFunctionUrlPermission` (lines 169-175) -- public
   `lambda:InvokeFunctionUrl` with `Principal: *` is no
   longer needed. CloudFront uses OAC instead.

2. `ApiFunctionInvokePermission` (lines 177-183) -- public
   `lambda:InvokeFunction` with `Principal: *` is no longer
   needed. Replaced by `CloudFrontInvokePermission`.

#### Resources to Modify

1. `ApiFunction.FunctionUrlConfig.AuthType` (line 108):
   Change from `NONE` to `AWS_IAM`.

2. `ApiFunction.FunctionUrlConfig.Cors`: Remove the entire
   Cors block (lines 109-129). With CloudFront in front,
   browsers never reach the Function URL directly, so the
   Function URL's built-in CORS handling is irrelevant.
   pgrest-lambda handles CORS in the Lambda response, and
   CloudFront passes those headers through to the viewer.

3. `ApiFunction`: Add `ReservedConcurrentExecutions: 50` as a
   property on the function resource.

#### New Resources

**CloudFront Origin Access Control:**

```yaml
  CloudFrontOAC:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
      OriginAccessControlConfig:
        Name: !Sub '${ProjectName}-lambda-oac'
        OriginAccessControlOriginType: lambda
        SigningBehavior: always
        SigningProtocol: sigv4
```

OAC with `OriginAccessControlOriginType: lambda` tells
CloudFront to sign requests to the Lambda Function URL with
SigV4, which satisfies the `AuthType: AWS_IAM` requirement.

**CloudFront Cache Policy:**

```yaml
  CloudFrontCachePolicy:
    Type: AWS::CloudFront::CachePolicy
    Properties:
      CachePolicyConfig:
        Name: !Sub '${ProjectName}-api-cache'
        DefaultTTL: 60
        MaxTTL: 60
        MinTTL: 0
        ParametersInCacheKeyAndForwardedToOrigin:
          CookiesConfig:
            CookieBehavior: none
          HeadersConfig:
            HeaderBehavior: whitelist
            Headers:
              - Authorization
              - apikey
          QueryStringsConfig:
            QueryStringBehavior: all
          EnableAcceptEncodingGzip: true
          EnableAcceptEncodingBrotli: true
```

The cache key includes `Authorization` and `apikey` headers
plus all query string parameters. This ensures different users
and different PostgREST queries get separate cache entries.
Cookies are excluded (BOA uses header-based auth, not
cookies).

**CloudFront Origin Request Policy:**

```yaml
  CloudFrontOriginRequestPolicy:
    Type: AWS::CloudFront::OriginRequestPolicy
    Properties:
      OriginRequestPolicyConfig:
        Name: !Sub '${ProjectName}-api-origin'
        CookiesConfig:
          CookieBehavior: none
        HeadersConfig:
          HeaderBehavior: whitelist
          Headers:
            - Content-Type
            - Accept
            - Prefer
            - x-client-info
            - X-Client-Info
            - X-Supabase-Api-Version
            - content-profile
            - accept-profile
        QueryStringsConfig:
          QueryStringBehavior: all
```

The origin request policy forwards headers that pgrest-lambda
needs for content negotiation, profile selection, and client
identification. `Authorization` and `apikey` are in the cache
policy and are automatically forwarded. Headers not in either
policy are stripped by CloudFront.

**CloudFront Distribution:**

```yaml
  CloudFrontDistribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Enabled: true
        Comment: !Sub '${ProjectName} API'
        DefaultCacheBehavior:
          TargetOriginId: lambda-origin
          ViewerProtocolPolicy: https-only
          AllowedMethods:
            - GET
            - HEAD
            - OPTIONS
            - PUT
            - PATCH
            - POST
            - DELETE
          CachedMethods:
            - GET
            - HEAD
          CachePolicyId: !Ref CloudFrontCachePolicy
          OriginRequestPolicyId: !Ref CloudFrontOriginRequestPolicy
          Compress: true
        Origins:
          - Id: lambda-origin
            DomainName: !Select
              - 2
              - !Split ['/', !GetAtt ApiFunctionUrl.FunctionUrl]
            OriginAccessControlId: !Ref CloudFrontOAC
            CustomOriginConfig:
              HTTPSPort: 443
              OriginProtocolPolicy: https-only
        WebACLId: !If
          - IsUsEast1
          - !GetAtt WafWebAcl.Arn
          - !Ref 'AWS::NoValue'
        HttpVersion: http2and3
        PriceClass: PriceClass_100
```

Notes on the distribution configuration:

- **Origin domain extraction:** The Function URL output is a
  full URL like `https://abc123.lambda-url.us-east-1.on.aws/`.
  CloudFront needs just the domain. `!Select [2, !Split ['/',
  ...]]` extracts the domain portion after `https://`.

- **PriceClass_100:** US, Canada, and Europe edge locations
  only. This is the cheapest price class and covers the
  regions where most BOA users are. Can be upgraded later.

- **WebACLId:** Associates the WAF WebACL with the
  distribution.

- **CachedMethods:** Only GET and HEAD are cached. All other
  methods (POST, PUT, PATCH, DELETE, OPTIONS) are forwarded
  to origin on every request.

- **ViewerProtocolPolicy: https-only:** All traffic is HTTPS.
  HTTP requests are rejected.

**CloudFront Invoke Permission:**

```yaml
  CloudFrontInvokePermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !GetAtt ApiFunction.Arn
      Action: lambda:InvokeFunctionUrl
      Principal: cloudfront.amazonaws.com
      SourceArn: !Sub >-
        arn:aws:cloudfront::${AWS::AccountId}:distribution/${CloudFrontDistribution}
      FunctionUrlAuthType: AWS_IAM
```

This grants CloudFront permission to invoke the Function URL.
The `SourceArn` scopes the permission to this specific
distribution -- no other CloudFront distribution can invoke
the function.

**WAF Web ACL:**

```yaml
  WafWebAcl:
    Type: AWS::WAFv2::WebACL
    Condition: IsUsEast1
    Properties:
      Name: !Sub '${ProjectName}-waf'
      Scope: CLOUDFRONT
      DefaultAction:
        Allow: {}
      VisibilityConfig:
        SampledRequestsEnabled: true
        CloudWatchMetricsEnabled: true
        MetricName: !Sub '${ProjectName}-waf'
      Rules:
        - Name: rate-limit
          Priority: 1
          Action:
            Block: {}
          VisibilityConfig:
            SampledRequestsEnabled: true
            CloudWatchMetricsEnabled: true
            MetricName: !Sub '${ProjectName}-rate-limit'
          Statement:
            RateBasedStatement:
              Limit: 1000
              AggregateKeyType: IP
        - Name: ip-reputation
          Priority: 2
          OverrideAction:
            None: {}
          VisibilityConfig:
            SampledRequestsEnabled: true
            CloudWatchMetricsEnabled: true
            MetricName: !Sub '${ProjectName}-ip-reputation'
          Statement:
            ManagedRuleGroupStatement:
              VendorName: AWS
              Name: AWSManagedRulesAmazonIpReputationList
```

- **Rate-based rule (priority 1):** Blocks any IP that sends
  more than 1000 requests in a 5-minute window. The
  `RateBasedStatement` with `Limit: 1000` and
  `AggregateKeyType: IP` counts requests per source IP.
  Blocked IPs are automatically unblocked after the rate
  drops below the threshold.

- **IP reputation list (priority 2):** AWS-managed rule group
  that blocks requests from known bad actors (botnets, known
  attackers, IP addresses with poor reputation). Uses
  `OverrideAction: None` to apply the managed rule group's
  own actions.

- **Default action: Allow.** Only rate violators and bad IPs
  are blocked. Legitimate traffic passes through.

- **Scope: CLOUDFRONT.** WAFv2 WebACLs with
  `Scope: CLOUDFRONT` can only be created in `us-east-1`. If
  the stack is deployed to `us-east-2`, the WAF resource will
  fail to create. Since BOA supports both `us-east-1` and
  `us-east-2` for DSQL, the WAF resource must use a
  `Condition` to only create when the region is `us-east-1`.

  **Resolution:** Add a `Condition` to the template:

  ```yaml
  Conditions:
    IsUsEast1: !Equals [!Ref 'AWS::Region', 'us-east-1']
  ```

  Apply `Condition: IsUsEast1` to `WafWebAcl` and the
  `WebACLId` property on `CloudFrontDistribution` uses
  `!If`:

  ```yaml
  WebACLId: !If
    - IsUsEast1
    - !GetAtt WafWebAcl.Arn
    - !Ref 'AWS::NoValue'
  ```

  When deployed to `us-east-2`, CloudFront is created without
  WAF. The rate limiting and IP reputation rules are not
  active, but CloudFront + OAC + reserved concurrency still
  provide significant protection. A future enhancement can
  add a cross-region WAF deployment for `us-east-2`.

**Lambda Throttle Alarm:**

```yaml
  ThrottleAlarmTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: !Sub '${ProjectName}-throttle-alarm'

  LambdaThrottleAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: !Sub '${ProjectName}-api-throttled'
      AlarmDescription: >-
        API function is being throttled. This may indicate
        a traffic spike or denial-of-wallet attack.
      Namespace: AWS/Lambda
      MetricName: Throttles
      Dimensions:
        - Name: FunctionName
          Value: !Sub '${ProjectName}-api'
      Statistic: Sum
      Period: 300
      EvaluationPeriods: 1
      Threshold: 0
      ComparisonOperator: GreaterThanThreshold
      AlarmActions:
        - !Ref ThrottleAlarmTopic
```

Fires when any Lambda throttle occurs in a 5-minute period.
The SNS topic is created without subscribers -- the developer
adds their email or integrates with their alerting system.
The `boa init` output should mention the topic ARN so
developers know where to subscribe.

#### Updated Outputs

```yaml
Outputs:
  ApiFunctionUrl:
    Description: Lambda Function URL (internal, behind CloudFront)
    Value: !GetAtt ApiFunctionUrl.FunctionUrl

  CloudFrontUrl:
    Description: CloudFront distribution URL (primary API endpoint)
    Value: !Sub >-
      https://${CloudFrontDistribution.DomainName}

  CloudFrontDistributionId:
    Description: CloudFront distribution ID
    Value: !Ref CloudFrontDistribution

  UserPoolId:
    Description: Cognito User Pool ID
    Value: !Ref UserPool

  UserPoolClientId:
    Description: Cognito User Pool Client ID
    Value: !Ref UserPoolClient

  BucketName:
    Description: S3 storage bucket name
    Value: !Ref StorageBucket

  DsqlEndpoint:
    Description: Aurora DSQL cluster endpoint
    Value: !GetAtt DsqlCluster.Endpoint

  ThrottleAlarmTopicArn:
    Description: SNS topic for Lambda throttle alarms
    Value: !Ref ThrottleAlarmTopic
```

New outputs: `CloudFrontUrl`, `CloudFrontDistributionId`,
`ThrottleAlarmTopicArn`. Existing `ApiFunctionUrl` is kept
for reference.

### CLI Changes

#### `cli/commands/init.mjs`

Update the output extraction block (lines 365-396):

```javascript
// Extract CloudFormation outputs
const outputs = aws.cfnDescribeStacks(name, region);
const functionUrl = getOutputValue(outputs, 'ApiFunctionUrl');
const cloudFrontUrl = getOutputValue(outputs, 'CloudFrontUrl');
const distributionId = getOutputValue(
  outputs, 'CloudFrontDistributionId'
);
const userPoolId = getOutputValue(outputs, 'UserPoolId');
const userPoolClientId = getOutputValue(
  outputs, 'UserPoolClientId'
);
const bucketName = getOutputValue(outputs, 'BucketName');
const dsqlEndpoint = getOutputValue(outputs, 'DsqlEndpoint');
const throttleTopicArn = getOutputValue(
  outputs, 'ThrottleAlarmTopicArn'
);

// apiUrl is the CloudFront domain (primary entry point)
const apiUrl = cloudFrontUrl || functionUrl;

// Write config
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

The `apiUrl` uses the CloudFront URL as the primary entry
point. The raw `functionUrl` is stored separately.

#### `cli/commands/deploy.mjs`

Same output extraction pattern. Update the migration warning
(lines 10-17) to also detect Function URL -> CloudFront
migration:

```javascript
export function needsMigrationWarning(cfg) {
  const extensions = cfg.extensions || [];
  // API Gateway -> Function URL migration
  const isApiGateway = cfg.apiUrl &&
    cfg.apiUrl.includes('execute-api.') &&
    !extensions.includes('api-gateway');
  // Function URL -> CloudFront migration
  const isFunctionUrl = cfg.apiUrl &&
    cfg.apiUrl.includes('lambda-url.') &&
    !cfg.cloudfront;
  return isApiGateway || isFunctionUrl;
}
```

When `isFunctionUrl` is true, show:
```
  ! This version of boa adds CloudFront + WAF protection.
    Your API URL will change. Update your frontend config
    after deploy.
```

Update the output extraction to extract CloudFront outputs
and write them to config using the same pattern as init.

The api-gateway extension logic (lines 79-91) continues to
work: when the extension is enabled, `apiUrl` points to API
Gateway. The `cloudfront` object should be removed from config
when an extension replaces the traffic layer.

#### `cli/commands/verify.mjs`

Replace the 2 public permission checks with 5 new checks
and update existing ones. The full check list becomes:

1. Cognito self-signup
2. CloudFront distribution is deployed
3. WAF WebACL is attached (skip if region != us-east-1)
4. CloudFront has `lambda:InvokeFunctionUrl` permission
5. Direct Function URL returns 403
6. API responding through CloudFront (HTTP 200/401/404)
7. S3 bucket exists
8. S3 Block Public Access enabled
9. Reserved concurrency is set

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

  // Check 3: WAF attached
  if (region === 'us-east-1') {
    let wafArn;
    try {
      const distArn =
        `arn:aws:cloudfront::${cfg.accountId}` +
        `:distribution/${cfg.cloudfront.distributionId}`;
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
      && s.Principal?.Service === 'cloudfront.amazonaws.com'
  );
  check(
    hasCfPermission,
    'CloudFront has lambda:InvokeFunctionUrl permission'
  );
} else {
  check(false, 'Function URL resource policy exists');
}

// Check 5: Direct Function URL returns 403
if (cfg.functionUrl) {
  console.log('Checking Function URL access...');
  let directCode;
  try {
    directCode = aws.exec(
      `curl -s -o /dev/null -w '%{http_code}'` +
        ` ${cfg.functionUrl}/rest/v1/`
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

The API endpoint check (current check 3) now curls the
CloudFront URL (`cfg.apiUrl`) instead of the Function URL.

The reserved concurrency check:

```javascript
// Check 9: Reserved concurrency
console.log('Checking Lambda concurrency...');
let concurrency;
try {
  concurrency = aws.exec(
    `aws lambda get-function` +
      ` --function-name ${functionName}` +
      ` --region ${region}` +
      ` --query 'Concurrency.ReservedConcurrentExecutions'` +
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

#### `cli/commands/status.mjs`

Add the Function URL line after API URL (line 20):

```javascript
console.log(`  API URL:      ${apiUrl}`);
if (cfg.functionUrl) {
  console.log(
    `  Function URL: ${cfg.functionUrl} (internal)`
  );
}
```

#### `cli/lib/extensions.mjs`

Update `mergeTemplate` to handle CloudFront resource removal
when an extension replaces the traffic layer.

The api-gateway extension transform (lines 58-81) needs to:

1. Remove CloudFront-related resources: `CloudFrontDistribution`,
   `CloudFrontOAC`, `CloudFrontCachePolicy`,
   `CloudFrontOriginRequestPolicy`,
   `CloudFrontInvokePermission`, `WafWebAcl`,
   `LambdaThrottleAlarm`, `ThrottleAlarmTopic`.
2. Change `ApiFunction.FunctionUrlConfig.AuthType` back to
   `NONE`.
3. Restore the CORS block on `FunctionUrlConfig`.
4. Add public invoke permissions (`ApiFunctionUrlPermission`,
   `ApiFunctionInvokePermission`).
5. Remove `ReservedConcurrentExecutions` from `ApiFunction`.
6. Remove CloudFront-related outputs.

```javascript
if (extensions.includes('api-gateway')) {
  // Remove CloudFront resources
  const cloudFrontResources = [
    'CloudFrontDistribution', 'CloudFrontOAC',
    'CloudFrontCachePolicy', 'CloudFrontOriginRequestPolicy',
    'CloudFrontInvokePermission', 'WafWebAcl',
    'LambdaThrottleAlarm', 'ThrottleAlarmTopic',
  ];
  const baseResources = doc.get('Resources', true);
  for (const name of cloudFrontResources) {
    baseResources.delete(name);
  }

  // Revert AuthType to NONE
  doc.setIn(
    ['Resources', 'ApiFunction', 'Properties',
     'FunctionUrlConfig', 'AuthType'],
    'NONE'
  );

  // Remove ReservedConcurrentExecutions
  const apiProps = doc.getIn(
    ['Resources', 'ApiFunction', 'Properties'], true
  );
  apiProps.delete('ReservedConcurrentExecutions');

  // Add Events for API Gateway
  // ... (existing code for ProxyRoot/ProxyPlus)

  // Remove CloudFront outputs
  const baseOutputs = doc.get('Outputs', true);
  for (const key of [
    'CloudFrontUrl', 'CloudFrontDistributionId',
    'ThrottleAlarmTopicArn',
  ]) {
    baseOutputs.delete(key);
  }
}
```

### No Changes to pgrest-lambda

CloudFront proxies HTTP requests to the Function URL as-is.
The Lambda event format does not change (payload format 2.0).
pgrest-lambda continues to handle JWT validation and CORS
internally. This is infrastructure-only.

With CloudFront in front, browsers never reach the Function
URL directly, so the Function URL's built-in CORS handling
is irrelevant. pgrest-lambda already returns CORS headers in
every response, and CloudFront passes them through. CORS
continues to work without any changes to pgrest-lambda.

### Deployment Time Impact

CloudFront distributions take 5-15 minutes to deploy. This
significantly increases `boa init` time from ~3 minutes to
~15-20 minutes. The SAM deploy output will show the
distribution creation in progress. This is a one-time cost
per deployment; subsequent `boa deploy` runs that don't
modify the distribution are faster.

The `boa init` output should set expectations:

```
Deploying... (CloudFront distribution takes ~10 minutes)
```

## Code Architecture / File Changes

### Modified Files

| File | Change |
|------|--------|
| `cli/templates/backend.yaml` | Add Condition (IsUsEast1), CloudFront distribution, OAC, cache policy, origin request policy, WAF, alarm, SNS topic, CloudFront permission. Change AuthType to AWS_IAM. Remove CORS from FunctionUrlConfig. Remove public permission resources. Add ReservedConcurrentExecutions. Update Outputs. |
| `cli/commands/init.mjs` | Extract CloudFrontUrl, CloudFrontDistributionId, ThrottleAlarmTopicArn from outputs. Write apiUrl as CloudFront domain, functionUrl separately, cloudfront object. |
| `cli/commands/deploy.mjs` | Same output extraction. Update migration warning for Function URL -> CloudFront upgrade. Remove cloudfront object when extension replaces traffic layer. |
| `cli/commands/verify.mjs` | Add CloudFront distribution check, WAF attached check (us-east-1 only), direct Function URL 403 check, reserved concurrency check. Update permission check for cloudfront.amazonaws.com. |
| `cli/commands/status.mjs` | Add Function URL line with "(internal)" label. |
| `cli/lib/extensions.mjs` | Add CloudFront resource removal and AuthType revert logic for api-gateway extension. |
| `plugin/skills/boa/SKILL.md` | Update description line, architecture diagram, add traffic layer explanation, update critical rules 12-14, update API-PATTERNS.md reference. |
| `plugin/CLAUDE.md` | Update architecture table (API layer to CloudFront + WAF), add critical rule about Function URLs behind CloudFront. |
| `plugin/docs/API-PATTERNS.md` | Update header to cover CloudFront patterns. Add CloudFront section. |
| `plugin/docs/PITFALLS.md` | Add entries for CloudFront 403, CORS through CloudFront, cache stale data. |

### No New Files

All changes modify existing files. The new SAM resources are
added to the existing `backend.yaml` template. No new CLI
commands are introduced.

## Testing Strategy

### Manual Integration Test Plan

#### Phase A: Default Backend with CloudFront

1. **`boa init test-cf --region us-east-1`** -- Creates
   project and deploys. Verify:
   - `.boa/config.json` has `apiUrl` matching
     `cloudfront.net` pattern.
   - `functionUrl` is present and matches
     `lambda-url.*.on.aws` pattern.
   - `cloudfront` object has `distributionId` and
     `domainName`.
   - `extensions` array is empty.

2. **Direct Function URL access** -- `curl` the
   `functionUrl` directly. Expect HTTP 403 (IAM auth
   enforced, no SigV4 signature).
   > This test's expected 403 could also come from
   > pgrest-lambda rejecting a request without a valid API
   > key. The implementing agent should verify the 403 is
   > returned by AWS (response body contains
   > `{"Message":"Forbidden"}`) before the request reaches
   > Lambda (no CloudWatch log entry for this request).

3. **Auth through CloudFront** -- Sign up and sign in using
   `@supabase/supabase-js` against the CloudFront URL.
   Verify tokens are issued and refresh works.

4. **REST CRUD through CloudFront** -- Create, read, update,
   delete rows via PostgREST endpoints through the CloudFront
   URL. Verify all operations return correct data.

5. **CORS through CloudFront** -- From a browser on
   `localhost`, make a fetch request to the CloudFront URL.
   Verify preflight OPTIONS and actual request succeed with
   correct CORS headers.

6. **Cache behavior** -- Make two identical GET requests
   within 60 seconds. Verify the second request is faster
   (served from CloudFront cache). Check the
   `X-Cache: Hit from cloudfront` header on the second
   request.

7. **`boa verify`** -- All 9 checks pass. CloudFront
   deployed, WAF attached, Function URL returns 403,
   reserved concurrency set.

8. **`boa status`** -- Shows CloudFront URL as API URL.
   Function URL shown with "(internal)" label.

#### Phase B: API Gateway Extension with CloudFront

9. **`boa extend api-gateway`** -- Deploys API Gateway.
   Verify:
   - `.boa/config.json` `apiUrl` changes to API Gateway URL.
   - `cloudfront` object is removed from config.
   - `extensions` contains `["api-gateway"]`.
   - `functionUrl` is stored.
   - CloudFront distribution is deleted from the stack.

10. **REST CRUD through API Gateway** -- Same CRUD test
    through the API Gateway URL.

11. **`boa verify`** -- Checks adapt to API Gateway mode
    (no CloudFront checks, original Function URL permission
    checks).

#### Phase C: Extension Removal

12. **`boa remove api-gateway`** -- Restores CloudFront.
    Verify:
    - `apiUrl` reverts to CloudFront domain.
    - `cloudfront` object is restored.
    - `extensions` is empty.
    - Direct Function URL returns 403 again.

13. **REST CRUD still works** -- Through the CloudFront URL.

#### Phase D: us-east-2 Deployment (No WAF)

14. **`boa init test-cf-east2 --region us-east-2`** --
    Verify:
    - CloudFront distribution is created (CloudFront is
      global).
    - WAF WebACL is NOT created (CLOUDFRONT scope requires
      us-east-1).
    - `boa verify` skips WAF check for us-east-2.
    - Everything else works: OAC, IAM auth, reserved
      concurrency.

#### Phase E: Migration Path

15. **Existing Function URL project** -- Deploy with current
    CLI (no CloudFront), then upgrade CLI and run
    `boa deploy`. Verify:
    - Migration warning is shown.
    - `apiUrl` changes from Function URL to CloudFront URL.
    - `cloudfront` object is added to config.
    - App still works through the new URL.

16. **Config compatibility** -- Read a config written by the
    old CLI (no `cloudfront` object, no `functionUrl`). Verify
    all commands handle missing fields gracefully.

### Edge Cases

- **CloudFront distribution still deploying:** If `boa verify`
  runs while the distribution is still propagating (`InProgress`
  status), the check should report the status rather than
  failing silently.

- **Lambda cold start + CloudFront timeout:** CloudFront has a
  30-second origin timeout by default. Lambda timeout is 30
  seconds. A cold start + slow query could hit the CloudFront
  timeout. The template does not change the default origin
  timeout, which is acceptable for now.

- **Rate limit false positives:** A legitimate high-traffic app
  could trigger the 1000 req/5min rate limit. The developer
  can increase the limit by modifying the WAF rule in their
  template. This is documented in API-PATTERNS.md.

## Implementation Order

### Phase 1: SAM Template

1. Add `Conditions` section with `IsUsEast1` condition.
2. Add CloudFront OAC resource.
3. Add CloudFront cache policy and origin request policy.
4. Add CloudFront distribution resource.
5. Add CloudFront invoke permission.
6. Add WAF WebACL with condition.
7. Add SNS topic and CloudWatch alarm.
8. Change `AuthType` from `NONE` to `AWS_IAM`.
9. Remove CORS from `FunctionUrlConfig`.
10. Add `ReservedConcurrentExecutions: 50` to `ApiFunction`.
11. Remove `ApiFunctionUrlPermission` and
    `ApiFunctionInvokePermission`.
12. Update Outputs.

### Phase 2: CLI Commands

13. Update `cli/commands/init.mjs` -- extract CloudFront
    outputs, write new config format.
14. Update `cli/commands/deploy.mjs` -- same output extraction,
    migration warning, config updates.
15. Update `cli/commands/verify.mjs` -- add CloudFront, WAF,
    Function URL 403, and concurrency checks.
16. Update `cli/commands/status.mjs` -- add Function URL line.

### Phase 3: Extension System

17. Update `cli/lib/extensions.mjs` -- add CloudFront resource
    removal and AuthType revert for api-gateway extension.

### Phase 4: Skill and Documentation

18. Update `plugin/skills/boa/SKILL.md` -- architecture diagram,
    description, critical rules, doc references.
19. Update `plugin/CLAUDE.md` -- architecture table, critical
    rule.
20. Update `plugin/docs/API-PATTERNS.md` -- CloudFront patterns.
21. Update `plugin/docs/PITFALLS.md` -- CloudFront entries.

### Phase 5: End-to-End Validation

22. Deploy to us-east-1 and run full test plan (Phases A-C, E).
23. Deploy to us-east-2 and run Phase D test plan.

## Open Questions

1. **WAF in us-east-2.** WAFv2 with `Scope: CLOUDFRONT` can
   only be created in `us-east-1`. BOA supports `us-east-2`
   for DSQL. The design uses a condition to skip WAF in
   us-east-2. Should we instead deploy WAF via a nested stack
   targeting us-east-1? This adds complexity but ensures rate
   limiting in all regions. For now, the condition approach is
   simpler and CloudFront + OAC + reserved concurrency still
   provide significant protection without WAF.

2. **WAF cost for free-tier users.** WAF adds ~$7/month base
   cost (web ACL + 2 rules). BOA's promise is "free until
   your users show up." Should WAF be opt-in rather than
   default? The trade-off: $7/month for DoW protection vs.
   potentially unlimited Lambda bills from an attacker. The
   design includes WAF as default because the risk of not
   having it is higher than the cost.

3. **CloudFront deployment time.** Initial distribution
   creation takes 5-15 minutes, significantly increasing
   `boa init` time. Should we provide a `--no-cloudfront`
   flag for development/testing? Or should we accept the
   longer deploy time as the price of security?

4. **Reserved concurrency limit.** 50 concurrent executions is
   a conservative default. A busy app might need more. Should
   this be configurable via `.boa/config.json` or a CLI flag?
   For now, developers can modify the template directly.

5. **Cache invalidation on deploy.** When `boa deploy` updates
   Lambda code, cached GET responses at CloudFront edge may
   serve stale data for up to 60 seconds. Should `boa deploy`
   automatically create a CloudFront invalidation? This adds
   latency and cost ($0.005 per path per invalidation after
   the first 1000/month). The 60-second TTL makes this
   unlikely to cause problems in practice.

---

## Addendum: OAC Replaced with Origin Secret Header (2026-04-14)

The original design used CloudFront OAC (Origin Access Control)
with SigV4 signing and `AuthType: AWS_IAM` on the Lambda
Function URL. This was replaced with an origin secret header
pattern due to a fundamental incompatibility:

**Problem:** AWS CloudFront OAC with Lambda Function URLs
requires clients to compute `x-amz-content-sha256` (SHA256
of the request body) for POST/PUT/PATCH/DELETE requests.
Lambda does not support unsigned payloads. Since
`@supabase/supabase-js` (our drop-in client) does not send
this header, every write operation through CloudFront failed
with HTTP 403 ("The request signature we calculated does not
match the signature you provided").

See: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html

**Solution:** CloudFront adds a secret `x-origin-verify`
header to every origin request via `OriginCustomHeaders`. The
Lambda handler rejects requests without the correct header
value. The secret is stored in SSM Parameter Store and
referenced by both CloudFront and the Lambda env var.

**Changes:**
- Removed `CloudFrontOAC` resource
- Changed `AuthType: AWS_IAM` to `AuthType: NONE`
- Added CORS block to `FunctionUrlConfig`
- Added `OriginCustomHeaders` with `x-origin-verify`
- Added `ORIGIN_SECRET` Lambda env var
- Replaced CloudFront-scoped permissions with public permissions
- Added origin secret check in Lambda handler

Same protection (only CloudFront can invoke Lambda), no
client-side changes needed, works with all HTTP methods.
