# Task 02: SAM Template -- CloudFront + WAF + Alarm Resources

**Agent:** implementer
**Design:** docs/design/cloudfront-dow-protection.md
**Depends on:** Task 01

## Objective

Update `cli/templates/backend.yaml` to add CloudFront as
the default traffic layer with WAF rate limiting, OAC for
Lambda origin auth, reserved concurrency, and a throttle
alarm.

## Target Tests

From `cli/__tests__/cloudfront-dow-protection.test.mjs`:

- Template contains CloudFrontDistribution resource
- Template contains CloudFrontOAC resource
- Template contains CloudFrontCachePolicy resource
- Template contains CloudFrontOriginRequestPolicy resource
- Template contains CloudFrontInvokePermission resource
- Template contains WafWebAcl resource
- Template contains ThrottleAlarmTopic resource
- Template contains LambdaThrottleAlarm resource
- Template contains IsUsEast1 condition
- WafWebAcl has Condition: IsUsEast1
- AuthType is AWS_IAM (not NONE)
- FunctionUrlConfig does NOT contain Cors block
- ApiFunction has ReservedConcurrentExecutions: 50
- Template does NOT contain ApiFunctionUrlPermission
- Template does NOT contain ApiFunctionInvokePermission
- CloudFrontInvokePermission principal is
  cloudfront.amazonaws.com
- CloudFrontInvokePermission action is
  lambda:InvokeFunctionUrl
- CloudFrontInvokePermission FunctionUrlAuthType is
  AWS_IAM
- Cache policy Headers include Authorization
- Cache policy Headers include apikey
- Cache policy DefaultTTL is 60
- Origin request policy Headers include Content-Type
- Origin request policy Headers include Prefer
- Origin request policy Headers include accept-profile
- OAC has OriginAccessControlOriginType: lambda
- OAC has SigningBehavior: always
- OAC has SigningProtocol: sigv4
- Distribution has PriceClass: PriceClass_100
- Distribution has ViewerProtocolPolicy: https-only
- Distribution has HttpVersion: http2and3
- WAF rule has Limit: 1000
- WAF rule has AggregateKeyType: IP
- WAF contains AWSManagedRulesAmazonIpReputationList
- Outputs contain CloudFrontUrl
- Outputs contain CloudFrontDistributionId
- Outputs contain ThrottleAlarmTopicArn
- Outputs still contain ApiFunctionUrl

## Implementation

All changes are in `cli/templates/backend.yaml`.

### 1. Add Conditions Section

Insert after the `Globals` section (after line 17) and
before the `Resources` section:

```yaml
Conditions:
  IsUsEast1: !Equals [!Ref 'AWS::Region', 'us-east-1']
```

### 2. Modify ApiFunction

**Change `AuthType` from `NONE` to `AWS_IAM`** (line 108).

**Remove the entire `Cors` block** (lines 109-129, from
`Cors:` through `MaxAge: 600`). With CloudFront in front,
browsers never reach the Function URL directly.
pgrest-lambda handles CORS in the Lambda response.

**Add `ReservedConcurrentExecutions: 50`** as a property
on the function resource, at the same level as
`FunctionName`, `Handler`, etc.

### 3. Remove Public Permission Resources

Delete the `ApiFunctionUrlPermission` resource (lines
169-175) and the `ApiFunctionInvokePermission` resource
(lines 177-183), including the comment block above them
(lines 164-168).

### 4. Add New Resources

Insert the following resources after the ApiFunction
resource and before the Storage section. The design
document (Technical Design section) specifies the exact
YAML for each resource. Add them in this order:

1. **CloudFrontOAC** -- OAC with
   `OriginAccessControlOriginType: lambda`,
   `SigningBehavior: always`, `SigningProtocol: sigv4`.

2. **CloudFrontCachePolicy** -- DefaultTTL: 60,
   MaxTTL: 60, MinTTL: 0. Headers: `Authorization`,
   `apikey`. QueryStrings: all. Cookies: none.
   EnableAcceptEncodingGzip and Brotli: true.

3. **CloudFrontOriginRequestPolicy** -- Headers:
   `Content-Type`, `Accept`, `Prefer`, `x-client-info`,
   `X-Client-Info`, `X-Supabase-Api-Version`,
   `content-profile`, `accept-profile`. QueryStrings:
   all. Cookies: none.

4. **CloudFrontDistribution** -- Origins using
   `!Select [2, !Split ['/', ...]]` to extract domain.
   OAC via `!Ref CloudFrontOAC`. DefaultCacheBehavior
   with cache policy and origin request policy refs.
   AllowedMethods: all 7. CachedMethods: GET, HEAD.
   ViewerProtocolPolicy: https-only. Compress: true.
   WebACLId: `!If [IsUsEast1, !GetAtt WafWebAcl.Arn,
   !Ref 'AWS::NoValue']`. HttpVersion: http2and3.
   PriceClass: PriceClass_100.

5. **CloudFrontInvokePermission** --
   `AWS::Lambda::Permission` granting
   `cloudfront.amazonaws.com` the
   `lambda:InvokeFunctionUrl` action. SourceArn scoped
   to the specific distribution. FunctionUrlAuthType:
   AWS_IAM.

6. **WafWebAcl** -- `Condition: IsUsEast1`.
   `Scope: CLOUDFRONT`. DefaultAction: Allow.
   Rules: rate-limit (1000 req/5min per IP, Block) and
   ip-reputation (AWS managed rule group,
   OverrideAction: None).

7. **ThrottleAlarmTopic** -- SNS topic.

8. **LambdaThrottleAlarm** -- CloudWatch alarm on
   AWS/Lambda Throttles metric. Period: 300,
   EvaluationPeriods: 1, Threshold: 0,
   ComparisonOperator: GreaterThanThreshold.

Use the exact YAML from the design document's Technical
Design section for each resource.

### 5. Update Outputs

Replace the existing Outputs section with:

- `ApiFunctionUrl` -- kept, description updated to
  "Lambda Function URL (internal, behind CloudFront)"
- `CloudFrontUrl` -- new, value:
  `!Sub 'https://${CloudFrontDistribution.DomainName}'`
- `CloudFrontDistributionId` -- new, value:
  `!Ref CloudFrontDistribution`
- `UserPoolId` -- unchanged
- `UserPoolClientId` -- unchanged
- `BucketName` -- unchanged
- `DsqlEndpoint` -- unchanged
- `ThrottleAlarmTopicArn` -- new, value:
  `!Ref ThrottleAlarmTopic`

### Important Notes

- Preserve 2-space indentation matching the rest of the
  template. Resource names at column 2, properties at
  column 4.
- The `Description` at the top of the template (line 3)
  should be updated to mention CloudFront.
- The comment above the removed permissions section
  should be replaced with a comment for the new
  CloudFront section.

## Test Requirements

No additional unit tests beyond the E2E tests in Task 01.
The template-structure tests in
`cli/__tests__/template-structure.test.mjs` will need
updating since they assert `AuthType: NONE` and the
absence of the old permission resources. Update these
tests to match the new template state:

- Change `AuthType: NONE` assertion to `AuthType: AWS_IAM`
- Remove or update tests that check for CORS in
  FunctionUrlConfig
- The `ApiFunctionUrl` output test should still pass

## Acceptance Criteria

- All "SAM template" tests in task 01 pass
- Updated template-structure tests pass
- The template is valid YAML (no syntax errors)
- `node --test cli/__tests__/template-structure.test.mjs`
  passes
- `node --test cli/__tests__/function-url-permission.test.mjs`
  still passes (update if needed -- the permission
  resource names have changed)

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If the template already contains CloudFront resources,
  escalate -- the design assumes they do not exist yet.
