# Rubric: No Known Pitfalls

## What we're verifying
The generated code and infrastructure avoid all documented BOA pitfalls.

## How to verify

Check the generated project for each known pitfall:

```bash
# 1. AWS_REGION as Lambda env var (should use REGION_NAME)
grep -r "AWS_REGION" template.yaml --include="*.yaml" --include="*.yml"

# 2. Python Lambda runtime
grep -r "python" template.yaml --include="*.yaml" | grep Runtime

# 3. Public S3 bucket
grep -r "PublicRead\|public-read\|BlockPublicAccess.*false" template.yaml

# 4. HTTP API instead of REST API
grep -r "HttpApi\|AWS::ApiGatewayV2" template.yaml

# 5. Missing globalThis polyfill (in Vite config)
grep -r "global.*globalThis\|globalThis" vite.config.* 2>/dev/null

# 6. Hardcoded database credentials
grep -rn "password.*=.*['\"]" --include="*.mjs" --include="*.js" --include="*.ts" src/ backend/

# 7. Amplify wildcard redirect
grep -r "/<\*>" --include="*.yaml" --include="*.yml" --include="*.json"
```

## Pass condition
- No `AWS_REGION` in Lambda environment variables
- No Python runtime in Lambda functions
- S3 Block Public Access is enabled (all four settings)
- REST API used (not HTTP API)
- `globalThis` polyfill present in Vite config (if using Vite)
- No hardcoded database passwords
- No wildcard Amplify redirects

## Fail condition
Any of the above checks finding a match indicates a pitfall.
