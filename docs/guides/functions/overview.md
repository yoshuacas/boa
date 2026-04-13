# Custom Functions

You don't need functions for CRUD -- that's handled automatically by the REST API. Write functions when you need business logic, third-party integrations, or scheduled jobs.

## When to write a function

- **Business logic**: process an order, calculate a score, send a notification
- **Third-party integrations**: Stripe webhooks, email via SES, external APIs
- **Scheduled jobs**: daily reports, cleanup tasks, data aggregation
- **Complex queries**: aggregations or multi-step operations beyond CRUD

If your logic is "read rows, filter, return" -- use the REST API instead.

## Project structure

Each function lives in its own directory under `functions/`:

```
project/
├── migrations/
├── policies/
├── functions/
│   ├── process-order/
│   │   ├── index.mjs
│   │   └── package.json      # only if extra dependencies
│   ├── stripe-webhook/
│   │   └── index.mjs
│   └── daily-report/
│       └── index.mjs
├── template.yaml
└── .boa/config.json
```

The function name is the directory name. The entry point is always `index.mjs` with an exported `handler`.

## Writing a function

```javascript
// functions/process-order/index.mjs
export async function handler(event) {
  const body = JSON.parse(event.body || '{}');
  const userId = event.requestContext?.authorizer?.userId || '';

  const result = await processOrder(body, userId);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(result),
  };
}
```

## Registering a function in template.yaml

Every function needs a corresponding resource in your `template.yaml`. Without it, the function directory is ignored during deploy.

Add a `AWS::Serverless::Function` resource for each custom function:

```yaml
Resources:
  # ... existing resources (Api, ApiFunction, etc.) ...

  ProcessOrderFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub '${ProjectName}-process-order'
      Handler: index.handler
      CodeUri: functions/process-order/
      Environment:
        Variables:
          DSQL_ENDPOINT: !GetAtt DsqlCluster.Endpoint
          REGION_NAME: !Ref 'AWS::Region'
          BUCKET_NAME: !Ref StorageBucket
          API_URL: !Sub 'https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod'
          ANON_KEY: '{{resolve:ssm:/${ProjectName}/anon-key}}'
          SERVICE_ROLE_KEY: '{{resolve:ssm:/${ProjectName}/service-role-key}}'
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - dsql:DbConnect
                - dsql:DbConnectAdmin
              Resource: !Sub 'arn:aws:dsql:${AWS::Region}:${AWS::AccountId}:cluster/${DsqlCluster}'
      Events:
        Api:
          Type: Api
          Properties:
            RestApiId: !Ref Api
            Path: /functions/v1/process-order
            Method: POST
```

Key points:
- `CodeUri` points to the function's directory.
- The `Path` follows the convention `/functions/v1/{function-name}`.
- Include only the IAM policies the function needs. If it doesn't access the database, omit the DSQL policy.

## Adding npm dependencies

If your function needs packages beyond the Node.js standard library, create a `package.json` in the function directory:

```bash
cd functions/process-order
npm init -y
npm install stripe
```

```
functions/process-order/
├── index.mjs
├── package.json
└── node_modules/
```

SAM bundles the function directory including `node_modules` during `sam build`. Each function gets its own dependencies -- they don't share a root `node_modules`.

## Calling functions from the frontend

```javascript
const { data, error } = await supabase.functions.invoke('process-order', {
  body: { items: cart, shipping: address }
})
```

This sends a POST to `/functions/v1/process-order` with the user's JWT automatically included.

## Three function types

### 1. API functions (called from the frontend)

Protected by the BOA Authorizer. The user's JWT is validated automatically:

```javascript
export async function handler(event) {
  const userId = event.requestContext.authorizer.userId;
  const email = event.requestContext.authorizer.email;
  // Process the request with authenticated user context
}
```

### 2. Webhook functions (called by external services)

No JWT -- the function validates the webhook signature itself. Set `Auth: NONE` on the route so the authorizer doesn't reject the request:

```yaml
Events:
  Api:
    Type: Api
    Properties:
      RestApiId: !Ref Api
      Path: /functions/v1/stripe-webhook
      Method: POST
      Auth:
        Authorizer: NONE    # No JWT required
```

```javascript
export async function handler(event) {
  const sig = event.headers['stripe-signature'];
  const stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
  // Process the webhook
}
```

### 3. Scheduled functions (cron jobs)

Triggered by EventBridge Scheduler. No HTTP endpoint, no API Gateway route:

```yaml
DailyReportFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: !Sub '${ProjectName}-daily-report'
    Handler: index.handler
    CodeUri: functions/daily-report/
    Environment:
      Variables:
        DSQL_ENDPOINT: !GetAtt DsqlCluster.Endpoint
        REGION_NAME: !Ref 'AWS::Region'
    Policies:
      - Statement:
          - Effect: Allow
            Action:
              - dsql:DbConnect
            Resource: !Sub 'arn:aws:dsql:${AWS::Region}:${AWS::AccountId}:cluster/${DsqlCluster}'
    Events:
      Schedule:
        Type: ScheduleV2
        Properties:
          ScheduleExpression: "cron(0 9 * * ? *)"    # daily at 9am UTC
```

Common schedule expressions:

| Schedule | Expression |
|----------|-----------|
| Every 5 minutes | `rate(5 minutes)` |
| Every hour | `rate(1 hour)` |
| Daily at midnight UTC | `cron(0 0 * * ? *)` |
| Weekdays at 9am UTC | `cron(0 9 ? * MON-FRI *)` |

## Using @supabase/supabase-js in functions

Functions can call the REST API just like the frontend. Use `SERVICE_ROLE_KEY` to bypass access policies:

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.API_URL, process.env.SERVICE_ROLE_KEY);

export async function handler(event) {
  const { data: users } = await supabase.from('users').select('*');
  await supabase.from('audit_log').insert({ action: 'report_generated' });
  return { statusCode: 200, body: JSON.stringify({ users }) };
}
```

## Auto-injected environment variables

Every function gets these when you include them in the template:

| Variable | Description |
|----------|-------------|
| `API_URL` | The BOA REST API endpoint |
| `ANON_KEY` | Public API key (respects policies) |
| `SERVICE_ROLE_KEY` | Admin API key (bypasses policies) |
| `DSQL_ENDPOINT` | Database hostname |
| `BUCKET_NAME` | S3 storage bucket |
| `REGION_NAME` | AWS region (**never use `AWS_REGION`** -- it's reserved by Lambda and will cause conflicts) |

## Logging

Use `console.log`, `console.warn`, and `console.error` in your handler. Output goes to CloudWatch Logs automatically:

```javascript
export async function handler(event) {
  console.log('Processing order', { userId: event.requestContext.authorizer.userId });
  // ...
  console.error('Payment failed', { error: err.message });
}
```

View logs via the AWS CLI:

```bash
# List recent log streams
aws logs describe-log-streams \
  --log-group-name /aws/lambda/myapp-process-order \
  --order-by LastEventTime --descending --limit 5

# Tail logs in real time
aws logs tail /aws/lambda/myapp-process-order --follow
```

Or open the CloudWatch Logs console and search by function name.

## Local testing

Test a function locally before deploying:

```bash
sam local invoke ProcessOrderFunction --event events/test-event.json
```

Create a test event file:

```json
{
  "body": "{\"items\": [{\"id\": \"prod-1\", \"qty\": 2}]}",
  "requestContext": {
    "authorizer": {
      "userId": "test-user-id",
      "email": "test@example.com",
      "role": "authenticated"
    }
  }
}
```

Note: `sam local invoke` requires Docker. It simulates the Lambda environment locally but does not connect to your deployed database unless you set the environment variables.

## Function defaults

| Setting | Value | Why |
|---------|-------|-----|
| Runtime | Node.js 20.x | Never Python (binary dependency failures in Lambda) |
| Timeout | 30 seconds | Increase for batch processing |
| Memory | 256 MB | Good balance of cost vs performance |
| Architecture | arm64 | 20% cheaper, same performance |

## Next step

[Deploying](/docs/deployment/overview) -- ship your backend to AWS.
