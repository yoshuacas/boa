import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(
  __dirname, '..', 'templates', 'backend.yaml'
);
const template = readFileSync(TEMPLATE_PATH, 'utf8');

// -----------------------------------------------------------
// API Gateway traffic layer (default)
// -----------------------------------------------------------

describe('SAM template — API Gateway default', () => {
  it('contains AWS::Serverless::Api resource', () => {
    assert.ok(
      template.includes('AWS::Serverless::Api'),
      'template should contain AWS::Serverless::Api'
    );
  });

  it('does NOT contain ElasticLoadBalancingV2::LoadBalancer', () => {
    assert.ok(
      !template.includes('ElasticLoadBalancingV2::LoadBalancer'),
      'template should NOT contain ElasticLoadBalancingV2::LoadBalancer'
    );
  });

  it('does NOT contain AWS::EC2::VPC', () => {
    assert.ok(
      !template.includes('AWS::EC2::VPC'),
      'template should NOT contain AWS::EC2::VPC'
    );
  });

  it('contains WafApiGatewayAssociation (not WafAlbAssociation)', () => {
    assert.ok(
      template.includes('WafApiGatewayAssociation'),
      'template should contain WafApiGatewayAssociation'
    );
    assert.ok(
      !template.includes('WafAlbAssociation'),
      'template should NOT contain WafAlbAssociation'
    );
  });

  it('Outputs contain ApiGatewayUrl and RestApiId', () => {
    assert.ok(
      template.includes('ApiGatewayUrl'),
      'Outputs should contain ApiGatewayUrl'
    );
    assert.ok(
      template.includes('RestApiId'),
      'Outputs should contain RestApiId'
    );
  });

  it('Outputs do NOT contain AlbUrl, AlbArn, TargetGroupArn, or VpcId', () => {
    assert.ok(
      !template.includes('AlbUrl'),
      'Outputs should NOT contain AlbUrl'
    );
    assert.ok(
      !template.includes('AlbArn'),
      'Outputs should NOT contain AlbArn'
    );
    assert.ok(
      !template.includes('TargetGroupArn'),
      'Outputs should NOT contain TargetGroupArn'
    );
    assert.ok(
      !template.includes('VpcId'),
      'Outputs should NOT contain VpcId'
    );
  });

  it('ApiFunction does NOT have ReservedConcurrentExecutions', () => {
    assert.ok(
      !template.includes('ReservedConcurrentExecutions'),
      'ApiFunction should NOT have ReservedConcurrentExecutions'
    );
  });

  it('ApiFunction has Events with ProxyRoot and ProxyPlus', () => {
    assert.ok(
      template.includes('ProxyRoot'),
      'ApiFunction should have ProxyRoot event'
    );
    assert.ok(
      template.includes('ProxyPlus'),
      'ApiFunction should have ProxyPlus event'
    );
  });

  // BETTER_AUTH_URL and API_BASE_URL are derived at request time
  // from the incoming event (not set as env vars in the template).
  // This avoids a CloudFormation circular dependency between the
  // function, the API Gateway stage, and the WAF association.
  it('does NOT set BETTER_AUTH_URL as a template env var', () => {
    assert.ok(
      !template.includes('BETTER_AUTH_URL:'),
      'BETTER_AUTH_URL must be derived at runtime, not set via env'
    );
  });

  it('does NOT set API_BASE_URL as a template env var', () => {
    assert.ok(
      !template.includes('API_BASE_URL:'),
      'API_BASE_URL must be derived at runtime, not set via env'
    );
  });

  it('contains WafWebAcl with Scope: REGIONAL', () => {
    assert.ok(
      template.includes('WafWebAcl'),
      'template should contain WafWebAcl'
    );
    assert.ok(
      template.includes('Scope: REGIONAL'),
      'WAF should have Scope: REGIONAL'
    );
  });

  it('does NOT contain FunctionUrlConfig', () => {
    assert.ok(
      !template.includes('FunctionUrlConfig'),
      'template should NOT contain FunctionUrlConfig'
    );
  });

  it('does NOT contain CloudFrontDistribution', () => {
    assert.ok(
      !template.includes('CloudFrontDistribution'),
      'template should NOT contain CloudFrontDistribution'
    );
  });

  it('does NOT contain ORIGIN_SECRET', () => {
    assert.ok(
      !template.includes('ORIGIN_SECRET'),
      'template should NOT contain ORIGIN_SECRET'
    );
  });

  it('does NOT contain ApiFunctionUrl output', () => {
    assert.ok(
      !template.includes('ApiFunctionUrl'),
      'template should NOT contain ApiFunctionUrl output'
    );
  });

  it('uses better-auth as the default auth provider', () => {
    assert.ok(
      template.includes('AUTH_PROVIDER: better-auth'),
      'template should set AUTH_PROVIDER to better-auth'
    );
    assert.ok(
      template.includes('BETTER_AUTH_SECRET'),
      'template should configure BETTER_AUTH_SECRET'
    );
  });

  it('does NOT contain Cognito resources', () => {
    assert.ok(
      !template.includes('AWS::Cognito::UserPool'),
      'template should not create a Cognito user pool'
    );
    assert.ok(
      !template.includes('USER_POOL_ID'),
      'template should not set USER_POOL_ID'
    );
    assert.ok(
      !template.includes('cognito-idp:'),
      'template should not grant Cognito IAM actions'
    );
  });
});

// -----------------------------------------------------------
// Config backwards compatibility
// -----------------------------------------------------------

describe('config backwards compatibility', () => {
  it('config without extensions field defaults to empty array', () => {
    const cfg = { stackName: 'test', region: 'us-east-1' };
    const extensions = cfg.extensions || [];
    assert.deepEqual(
      extensions, [],
      'cfg.extensions || [] should default to empty array'
    );
  });
});
