# API Gateway Extension

Adds an API Gateway REST API in front of the Lambda
Function URL. Use this extension when you need:

- Rate limiting and throttling
- AWS WAF integration
- Usage plans and API keys
- Custom domain names (with a future custom-domain
  extension)

## What it adds

- `AWS::Serverless::Api` resource with CORS and gateway
  responses configured
- API events on `ApiFunction` (ProxyRoot `/` and
  ProxyPlus `/{proxy+}`)
- `ApiGatewayUrl` CloudFormation output

## What it does NOT add

- No Lambda authorizer — pgrest-lambda handles JWT
  validation internally
- No additional Lambda functions

## Usage

```sh
boa extend api-gateway    # Add API Gateway
boa remove api-gateway    # Remove API Gateway
```
