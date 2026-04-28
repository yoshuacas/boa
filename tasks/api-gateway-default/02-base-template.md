# Task 02: Base Template -- API Gateway Default

**Agent:** implementer
**Design:** docs/design/api-gateway-default.md

## Objective

Replace ALB + VPC resources in the base template with API
Gateway REST, flip env vars to HTTPS, and update outputs.

## Target Tests

From `cli/__tests__/template-structure.test.mjs`:

- Base template contains `AWS::Serverless::Api`
- Base template does NOT contain
  `ElasticLoadBalancingV2::LoadBalancer`
- Base template does NOT contain `AWS::EC2::VPC`
- Base template contains `WafApiGatewayAssociation`
- Outputs contains `ApiGatewayUrl` and `RestApiId`
- Outputs does NOT contain `AlbUrl`, `AlbArn`,
  `TargetGroupArn`, `VpcId`
- `ApiFunction` does NOT have
  `ReservedConcurrentExecutions`
- `ApiFunction` has `Events` with `ProxyRoot` and
  `ProxyPlus`
- `BETTER_AUTH_URL` contains `execute-api`
- `API_BASE_URL` contains `execute-api`
- `WafWebAcl` still exists with `Scope: REGIONAL`

From `cli/__tests__/extensions.test.mjs`:

- Base template (no extensions) has `AWS::Serverless::Api`
- Base template has `ApiGatewayUrl` output

## Implementation

Edit `cli/templates/backend.yaml`:

### Add (from cli/extensions/api-gateway/fragment.yaml)

1. `Api` resource (`AWS::Serverless::Api`) with CORS
   headers, GatewayResponses for DEFAULT_4XX and
   DEFAULT_5XX. Copy the exact resource definition from
   `cli/extensions/api-gateway/fragment.yaml:1-22`,
   adding the `Name: !Sub '${ProjectName}-api'` property.

2. `Events` on `ApiFunction`:
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

3. `WafApiGatewayAssociation` resource:
   ```yaml
   WafApiGatewayAssociation:
     Type: AWS::WAFv2::WebACLAssociation
     Properties:
       ResourceArn: !Sub 'arn:aws:apigateway:${AWS::Region}::/restapis/${Api}/stages/prod'
       WebACLArn: !GetAtt WafWebAcl.Arn
   ```

4. New outputs:
   ```yaml
   ApiGatewayUrl:
     Description: API Gateway endpoint URL
     Value: !Sub 'https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod'
   RestApiId:
     Description: API Gateway REST API ID
     Value: !Ref Api
   ```

### Modify on `ApiFunction`

- Change `BETTER_AUTH_URL` from
  `!Sub 'http://${ApplicationLoadBalancer.DNSName}'` to
  `!Sub 'https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod'`
- Change `API_BASE_URL` from
  `!Sub 'http://${ApplicationLoadBalancer.DNSName}/rest/v1'` to
  `!Sub 'https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod/rest/v1'`
- Remove `ReservedConcurrentExecutions: 50`

### Remove (15 resources)

- `AlbVpc`, `InternetGateway`, `GatewayAttachment`
- `PublicSubnet1`, `PublicSubnet2`
- `PublicRouteTable`, `PublicRoute`
- `Subnet1RouteTableAssoc`, `Subnet2RouteTableAssoc`
- `AlbSecurityGroup`
- `ApplicationLoadBalancer`, `AlbLambdaPermission`,
  `AlbTargetGroup`, `AlbHttpListener`
- `WafAlbAssociation`

### Remove from Outputs

- `AlbUrl`, `AlbArn`, `TargetGroupArn`, `VpcId`

### Keep unchanged

- `DsqlCluster`, `StorageBucket`, `WafWebAcl` (and its
  rules), `BucketName`, `DsqlEndpoint`

### Update Description

```yaml
Description: BOA - Backend on AWS serverless stack (API Gateway, WAF, Aurora DSQL, Lambda, S3)
```

## Acceptance Criteria

- All target tests in `template-structure.test.mjs` pass
- All target tests in `extensions.test.mjs` for the base
  template (no extensions) pass
- Template is valid YAML and uses proper CloudFormation
  intrinsic functions (`!Sub`, `!Ref`, `!GetAtt`)

## Conflict Criteria

If all target tests already pass before any code changes
are made, investigate whether the tests are true positives
before marking the task complete.
