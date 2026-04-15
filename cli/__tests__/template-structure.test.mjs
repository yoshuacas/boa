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
// ALB traffic layer (default)
// -----------------------------------------------------------

describe('SAM template — ALB default', () => {
  it('contains ApplicationLoadBalancer resource', () => {
    assert.ok(
      template.includes('ApplicationLoadBalancer'),
      'template should contain ApplicationLoadBalancer'
    );
  });

  it('contains AlbTargetGroup with target-type lambda', () => {
    assert.ok(
      template.includes('AlbTargetGroup'),
      'template should contain AlbTargetGroup'
    );
    assert.ok(
      template.includes('TargetType: lambda'),
      'target group should have TargetType: lambda'
    );
  });

  it('contains AlbHttpListener on port 80', () => {
    assert.ok(
      template.includes('AlbHttpListener'),
      'template should contain AlbHttpListener'
    );
  });

  it('contains AlbLambdaPermission for ELB principal', () => {
    assert.ok(
      template.includes('AlbLambdaPermission'),
      'template should contain AlbLambdaPermission'
    );
    assert.ok(
      template.includes('elasticloadbalancing.amazonaws.com'),
      'permission should use ELB principal'
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

  it('contains WafAlbAssociation', () => {
    assert.ok(
      template.includes('WafAlbAssociation'),
      'template should contain WafAlbAssociation'
    );
  });

  it('contains VPC resources for ALB', () => {
    assert.ok(template.includes('AlbVpc'), 'should have AlbVpc');
    assert.ok(template.includes('InternetGateway'), 'should have InternetGateway');
    assert.ok(template.includes('PublicSubnet1'), 'should have PublicSubnet1');
    assert.ok(template.includes('PublicSubnet2'), 'should have PublicSubnet2');
    assert.ok(template.includes('AlbSecurityGroup'), 'should have AlbSecurityGroup');
  });

  it('Outputs contain AlbUrl', () => {
    assert.ok(
      template.includes('AlbUrl'),
      'Outputs should contain AlbUrl'
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

  it('there is NO Api resource (AWS::Serverless::Api)', () => {
    assert.ok(
      !template.includes('AWS::Serverless::Api'),
      'template should NOT contain AWS::Serverless::Api resource'
    );
  });

  it('ApiFunction does NOT have an Events property', () => {
    const start = template.indexOf('ApiFunction:');
    const end = template.indexOf('AlbVpc:');
    assert.ok(start !== -1, 'template should contain ApiFunction');
    assert.ok(end !== -1, 'template should contain AlbVpc');
    const apiFunctionSection = template.slice(start, end);
    assert.ok(
      !apiFunctionSection.includes('Events:'),
      'ApiFunction should NOT have an Events property in base template'
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
