# Deploying

Run `boa deploy`. That's it. BOA packages your functions, updates your backend, applies pending migrations, and refreshes the API schema. A typical deploy takes 2-3 minutes.

## What happens during deploy

```bash
boa deploy
```

Under the hood:

1. **`sam build`** -- packages each Lambda function with its dependencies
2. **`sam deploy`** -- creates or updates AWS resources via CloudFormation (only changed resources are touched)
3. **`boa migrate`** -- applies any pending SQL migration files from `migrations/`
4. **Schema refresh** -- pgrest-lambda re-introspects the database so new tables and columns are available via the REST API

## First deploy

```bash
mkdir my-app && cd my-app
boa init --region us-east-1
```

This creates the SAM template, deploys the full backend, runs initial migrations, and verifies everything. First deploy takes 3-5 minutes because CloudFormation creates all resources from scratch.

After init, `.boa/config.json` contains your API URL, keys, and connection details.

## Subsequent deploys

```bash
boa deploy
```

CloudFormation detects what changed in your template and applies only the delta. If you only changed function code, the deploy is faster (under 2 minutes). If you added new resources (a new S3 bucket, a new function), it takes longer.

## When a deploy fails

CloudFormation automatically rolls back to the last successful state. Your running backend is not affected by a failed deploy.

To diagnose:

```bash
# Check the stack status and see which resource failed
boa status

# View CloudFormation events for details
aws cloudformation describe-stack-events \
  --stack-name myapp \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`].[LogicalResourceId, ResourceStatusReason]' \
  --output table
```

Common failure causes:

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Resource limit exceeded` | Too many resources in one template | Split into nested stacks |
| `Role is not authorized to perform` | Missing IAM permissions | Add the required action to your SAM policy |
| `Template format error` | YAML syntax error in template.yaml | Validate with `sam validate` before deploying |
| `No changes to deploy` | Template hasn't changed | This is not an error -- nothing to update |

## Deployment time expectations

| Change type | Typical time |
|-------------|-------------|
| Lambda code only | 1-2 minutes |
| New Lambda function | 2-3 minutes |
| New resource | 3-5 minutes |
| First deploy (`boa init`) | 3-5 minutes |
| Database migration (schema change) | Seconds (runs after infra deploy) |

## Environments

Use different stack names for different environments. Each gets its own isolated set of AWS resources:

```bash
# Development
boa init --region us-east-1 --stack-name myapp-dev

# Staging
boa init --region us-east-1 --stack-name myapp-staging

# Production
boa init --region us-east-1 --stack-name myapp-prod
```

Each environment has its own database, authentication, API endpoint, file storage, and functions. They share nothing. You can deploy to dev without affecting production.

## CI/CD with GitHub Actions

Automate deploys on push to main:

```yaml
# .github/workflows/deploy.yml
name: Deploy BOA Backend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: aws-actions/setup-sam@v2

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - run: npm install -g boa-cli
      - run: boa deploy
```

Store your AWS credentials as GitHub repository secrets. For production, use OIDC federation with an IAM role instead of long-lived access keys.

## Verify a deployment

```bash
boa verify
```

This checks:
- CloudFormation stack status
- Database connectivity
- Authentication health
- API endpoint accessibility
- Function health
- File storage bucket existence

Run this after every deploy, or add it to your CI pipeline as a post-deploy step.

## Check stack status

```bash
boa status
```

Shows your stack name, region, API URL, database tables, and migration state.

## Frontend hosting with Amplify

BOA backends pair with AWS Amplify for frontend hosting:

```yaml
AmplifyApp:
  Type: AWS::Amplify::App
  Properties:
    Name: !Sub "${ProjectName}-frontend"
    Repository: https://github.com/your-org/your-frontend
    BuildSpec: |
      version: 1
      frontend:
        phases:
          build:
            commands:
              - npm ci
              - npm run build
        artifacts:
          baseDirectory: dist
          files:
            - '**/*'
```

Amplify builds and deploys your frontend automatically when you push to your Git repository.

### SPA redirect rule

For single-page apps, configure the redirect rule to serve `index.html` for all routes except static assets. **Never use `/<*>` as the redirect pattern** -- it breaks static asset loading. Use a regex that excludes file extensions:

```
Source: </^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>
Target: /index.html
Status: 200
```

## Custom domains

Add a custom domain to your API Gateway or Amplify app through the AWS Console or by adding resources to your SAM template. Both services provision SSL certificates automatically. See [API Gateway custom domains](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-custom-domains.html) and [Amplify custom domains](https://docs.aws.amazon.com/amplify/latest/userguide/custom-domains.html) in the AWS documentation.

## Teardown

```bash
boa teardown
```

Destroys all resources in the backend. Requires confirmation. This is irreversible -- data is deleted. Databases and storage buckets with data have deletion protection enabled and will need manual removal if the teardown can't delete them.

## Next step

You're deployed. Go build. If you need to revisit the basics, start from the [Getting Started](/docs/getting-started) guide.
