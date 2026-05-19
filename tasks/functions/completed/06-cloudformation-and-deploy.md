# Task 06: CloudFormation Template and Deploy Integration

**Agent:** implementer
**Design:** docs/design/functions.md

**Depends on:** Task 02, Task 03, Task 04, Task 05

## Objective

Add the FunctionsLambda resources to `backend.yaml` and
integrate function discovery, packaging, and upload into the
`boa deploy` command flow.

## Target Tests

From `deploy-functions.test.mjs`:
- Deploy discovers, packages, uploads, passes
  FunctionsLambdaS3Key to CloudFormation
- Zip hash match skips upload (content-addressed)
- Max timeout/memory change triggers full stack update
- Unchanged config uses update-function-code only
- Empty functions/ still deploys Lambda with empty registry
- packageArtifacts() returns functionsKey field

## Implementation

### cli/templates/backend.yaml

Add the following resources (see design "CloudFormation
Deltas" section for full specification):

1. **FunctionsLambdaS3Key** parameter (Type: String)

2. **FunctionsLambdaRole** (AWS::IAM::Role):
   - AssumeRolePolicyDocument for lambda.amazonaws.com
   - Policies:
     - DSQL connect (same cluster as ApiFunction)
     - SSM read: `arn:aws:ssm:*:*:parameter/${ProjectName}/functions/*`
     - CloudWatch Logs (AWSLambdaBasicExecutionRole managed
       policy)
     - Lambda invoke on itself (for private function
       chaining): `arn:aws:lambda:*:*:function:${ProjectName}-functions`

3. **FunctionsLambda** (AWS::Lambda::Function):
   - Runtime: nodejs20.x
   - Handler: handler.handler
   - Timeout: 30
   - MemorySize: 256
   - Code: S3Bucket/S3Key from parameters
   - Role: !GetAtt FunctionsLambdaRole.Arn
   - Environment:
     - DSQL_ENDPOINT, REGION_NAME, STACK_NAME (ProjectName),
       JWT_SECRET, API_URL, ANON_KEY, SERVICE_ROLE_KEY

4. **FunctionsLogGroup** (AWS::Logs::LogGroup):
   - LogGroupName: `!Sub '/aws/lambda/${ProjectName}-functions'`
   - RetentionInDays: 30

5. **FunctionsApiResource** -> **FunctionsApiV1Resource** ->
   **FunctionsApiNameResource** (three
   AWS::ApiGateway::Resource entries):
   - `/functions` -> `/functions/v1` -> `/functions/v1/{name+}`

6. **FunctionsApiMethod** (AWS::ApiGateway::Method):
   - HttpMethod: ANY
   - AuthorizationType: NONE
   - Integration: AWS_PROXY to FunctionsLambda

7. **FunctionsLambdaPermission** (AWS::Lambda::Permission):
   - Action: lambda:InvokeFunction
   - Principal: apigateway.amazonaws.com
   - SourceArn pattern

8. Update **ApiDeployment** `DependsOn` to include
   `FunctionsApiMethod`.

### cli/lib/deploy.mjs (or cli/commands/deploy.mjs)

Add to the deploy flow after the existing ApiFunction
packaging step:

```javascript
// After existing packaging:
const descriptors = await discoverFunctions(projectRoot, {
  validateSecrets: true,
});
const { zipPath, zipHash, maxTimeout, maxMemory } =
  await packageFunctions(descriptors);
const functionsKey = `functions/${zipHash}.zip`;

// Content-addressed upload
const exists = await s3KeyExists(bucket, functionsKey);
if (!exists) {
  await uploadToS3(bucket, functionsKey, zipPath);
}

// Add to CloudFormation parameters
params.FunctionsLambdaS3Key = functionsKey;
```

Decision logic for update type:
- If `maxTimeout` or `maxMemory` differs from the deployed
  Lambda configuration, trigger a full stack update
  (CloudFormation handles the Lambda config change).
- If only function code changed (same timeout/memory), use
  `lambda:UpdateFunctionCode` for faster deploys.

Update `packageArtifacts()` return to include `functionsKey`:
```javascript
return { bucket, lambdaKey, functionsKey, templateUrl, accountId };
```

### Imports

Add imports for `discoverFunctions` from
`../lib/functions/discover.mjs` and `packageFunctions` from
`../lib/functions/package.mjs` in the deploy command.

## Acceptance Criteria

- All `deploy-functions.test.mjs` tests pass
- backend.yaml validates with `aws cloudformation validate-template`
- FunctionsLambda uses the FunctionsLambdaS3Key parameter
- API Gateway routes `/functions/v1/{name+}` to FunctionsLambda
- ApiDeployment depends on FunctionsApiMethod
- Existing tests still pass

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If the existing `backend.yaml` structure or deploy flow
  differs significantly from what is described in the design,
  adapt the implementation to fit the existing patterns while
  preserving the design's intent.
