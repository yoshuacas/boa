# Custom Functions

The default BOA stack has a single Lambda function. `pgrest-lambda`
handles every `/rest/v1/*` and `/auth/v1/*` route, so agents do not
add custom Lambda functions for CRUD, auth, or presigned URL flows.

Use a custom function only when the developer explicitly needs logic
that pgrest-lambda cannot express: a third-party webhook signature
check, an outbound integration with a service that requires server
credentials (Stripe, Twilio, SES), or a scheduled job that must not
be triggered from the client.

## Current Scope

BOA today does not ship a `functions/<name>/` scaffold or a built-in
extension that adds arbitrary Lambda functions. The default template
(`cli/templates/backend.yaml`) declares one `AWS::Lambda::Function`
resource named `ApiFunction` plus its integration, role, and
permissions.

To add a custom function, add a new `AWS::Lambda::Function` resource
to the template in place (or via `.boa/template.yaml` override),
along with its IAM role, environment variables, and event source
(API Gateway method, EventBridge rule, S3 notification). Run
`boa deploy` to package the Lambda source and update the stack.

## Conventions for a Custom Function

If the developer needs one:

- Put the source in `cli/templates/lambda/` alongside the default
  handler, or in a separate directory that `boa deploy` packages
  explicitly.
- Read the same flat authorizer keys pgrest-lambda uses so the
  function integrates with the rest of the stack:
  ```javascript
  event.requestContext.authorizer.role     // 'anon' | 'authenticated' | 'service_role'
  event.requestContext.authorizer.userId   // user UUID or '' for anon
  event.requestContext.authorizer.email    // user email or ''
  ```
- Use `REGION_NAME`, never `AWS_REGION`.
- Store secrets in SSM Parameter Store with `--type String`
  (CloudFormation's `{{resolve:ssm:/...}}` does not resolve
  `SecureString` for Lambda env vars) and reference them with
  `!Sub '{{resolve:ssm:/${ProjectName}/my-secret}}'`.

## Function Defaults

| Setting | Value | Why |
|---------|-------|-----|
| Runtime | Node.js 20.x | Never Python (binary dependency failures on Lambda) |
| Timeout | 30 seconds | Sufficient for API calls; increase for batch processing |
| Memory | 256 MB | Balance of cost vs. performance |
| Architecture | arm64 | 20% cheaper, same performance |
| Region | Same as the stack | Co-located with database and storage |

## Common Mistakes

### SSM `SecureString` does not work with Lambda env vars

CloudFormation's `{{resolve:ssm:...}}` only resolves `String` type
parameters. The `{{resolve:ssm-secure:...}}` prefix is not supported
for Lambda environment variables.

Store secrets as `--type String`:

```bash
aws ssm put-parameter --name "/<stack-name>/my-secret" --value "..." --type String
```

If the value must be encrypted at rest with a non-AWS-owned key, read
it at runtime from SSM using the AWS SDK and decrypt in the handler,
rather than injecting it as an env var.

### Referencing the RestApi in function env vars

A Lambda that declares an API Gateway event on `!Ref Api` and also
references `${Api}` in its environment variables closes a
CloudFormation dependency cycle. Derive the public base URL from the
request at runtime (`event.headers.host` plus
`event.headers['x-forwarded-proto']` and
`event.requestContext.stage`) instead of passing it as an env var.
