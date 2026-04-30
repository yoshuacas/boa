import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, mkdirSync,
  writeFileSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getRegistry, mergeTemplate, resolveTemplate,
} from '../lib/extensions.mjs';

// -----------------------------------------------------------
// Registry
// -----------------------------------------------------------

describe('extension registry', () => {
  it('getRegistry returns an object with an alb key', () => {
    const registry = getRegistry();
    assert.ok(
      'alb' in registry,
      'registry should have an "alb" key'
    );
  });

  it('alb entry has a fragmentPath and description', () => {
    const entry = getRegistry()['alb'];
    assert.ok(entry, 'alb entry should exist');
    assert.equal(
      typeof entry.description, 'string',
      'alb.description should be a string'
    );
    assert.ok(
      entry.description.length > 0,
      'description should not be empty'
    );
    assert.equal(
      typeof entry.fragmentPath, 'string',
      'alb.fragmentPath should be a string'
    );
  });

  it('getRegistry returns api-gateway with deprecated: true and fragmentPath: null', () => {
    const entry = getRegistry()['api-gateway'];
    assert.ok(entry, 'api-gateway entry should exist');
    assert.equal(
      entry.deprecated, true,
      'api-gateway should be deprecated'
    );
    assert.equal(
      entry.fragmentPath, null,
      'api-gateway.fragmentPath should be null'
    );
  });
});

// -----------------------------------------------------------
// Template merging — base (no extensions)
// -----------------------------------------------------------

describe('template merging — base (no extensions)', () => {
  it('mergeTemplate([]) result contains ApiFunction resource', () => {
    const result = mergeTemplate([]);
    assert.ok(
      result.includes('ApiFunction'),
      'merged template should contain ApiFunction resource'
    );
  });

  it('mergeTemplate([]) result contains AWS::Serverless::Api', () => {
    const result = mergeTemplate([]);
    assert.ok(
      result.includes('AWS::Serverless::Api'),
      'base template should contain AWS::Serverless::Api'
    );
  });

  it('mergeTemplate([]) result contains ApiGatewayUrl output', () => {
    const result = mergeTemplate([]);
    assert.ok(
      result.includes('ApiGatewayUrl'),
      'base template should contain ApiGatewayUrl in Outputs'
    );
  });

  it('mergeTemplate([]) result contains WafWebAcl', () => {
    const result = mergeTemplate([]);
    assert.ok(
      result.includes('WafWebAcl'),
      'base template should contain WafWebAcl'
    );
  });
});

// -----------------------------------------------------------
// Template merging — alb extension
// -----------------------------------------------------------

describe('template merging — alb extension', () => {
  it('result contains ElasticLoadBalancingV2::LoadBalancer', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      result.includes('ElasticLoadBalancingV2::LoadBalancer'),
      'merged template should contain ElasticLoadBalancingV2::LoadBalancer'
    );
  });

  it('result contains AWS::EC2::VPC (AlbVpc)', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      result.includes('AlbVpc'),
      'merged template should contain AlbVpc'
    );
    assert.ok(
      result.includes('AWS::EC2::VPC'),
      'merged template should contain AWS::EC2::VPC'
    );
  });

  it('result does NOT contain AWS::Serverless::Api', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      !result.includes('AWS::Serverless::Api'),
      'merged template should NOT contain AWS::Serverless::Api'
    );
  });

  it('ApiFunction does NOT have Events', () => {
    const result = mergeTemplate(['alb']);
    const start = result.indexOf('ApiFunction:');
    assert.ok(start !== -1, 'should contain ApiFunction');
    const section = result.slice(
      start, start + 1500
    );
    assert.ok(
      !section.includes('Events:'),
      'ApiFunction should NOT have Events after alb merge'
    );
  });

  it('ApiFunction has ReservedConcurrentExecutions: 50', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      result.includes('ReservedConcurrentExecutions'),
      'merged template should contain ReservedConcurrentExecutions'
    );
  });

  // BETTER_AUTH_URL and API_BASE_URL are derived at request time in
  // lambda/index.mjs (from Host / X-Forwarded-Proto). The ALB extension
  // must not inject them, otherwise the stack hits a circular dependency.
  it('does NOT inject BETTER_AUTH_URL env var', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      !result.includes('BETTER_AUTH_URL:'),
      'BETTER_AUTH_URL must be derived at runtime, not injected by ALB ext'
    );
  });

  it('does NOT inject API_BASE_URL env var', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      !result.includes('API_BASE_URL:'),
      'API_BASE_URL must be derived at runtime, not injected by ALB ext'
    );
  });

  it('Outputs contain AlbUrl, AlbArn, TargetGroupArn, VpcId', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      result.includes('AlbUrl'),
      'merged template should contain AlbUrl'
    );
    assert.ok(
      result.includes('AlbArn'),
      'merged template should contain AlbArn'
    );
    assert.ok(
      result.includes('TargetGroupArn'),
      'merged template should contain TargetGroupArn'
    );
    assert.ok(
      result.includes('VpcId'),
      'merged template should contain VpcId'
    );
  });

  it('Outputs do NOT contain ApiGatewayUrl or RestApiId', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      !result.includes('ApiGatewayUrl'),
      'merged template should NOT contain ApiGatewayUrl'
    );
    assert.ok(
      !result.includes('RestApiId'),
      'merged template should NOT contain RestApiId'
    );
  });

  it('contains WafAlbAssociation and does NOT contain WafApiGatewayAssociation', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      result.includes('WafAlbAssociation'),
      'merged template should contain WafAlbAssociation'
    );
    assert.ok(
      !result.includes('WafApiGatewayAssociation'),
      'merged template should NOT contain WafApiGatewayAssociation'
    );
  });

  it('WafWebAcl is still present (not removed by alb transform)', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      result.includes('WafWebAcl'),
      'WafWebAcl should remain in merged template'
    );
  });
});

// -----------------------------------------------------------
// Template merging — api-gateway deprecated (no-op)
// -----------------------------------------------------------

describe('template merging — api-gateway deprecated', () => {
  it('mergeTemplate(["api-gateway"]) returns base template unchanged', () => {
    const base = mergeTemplate([]);
    const result = mergeTemplate(['api-gateway']);
    assert.equal(
      result, base,
      'api-gateway extension should be a no-op (returns base template)'
    );
  });
});

// -----------------------------------------------------------
// Template merging — alb + api-gateway combo
// -----------------------------------------------------------

describe('template merging — alb + api-gateway combo', () => {
  it('test_merge_template_alb_and_deprecated_api_gateway: same as alb alone', () => {
    const albOnly = mergeTemplate(['alb']);
    const combo = mergeTemplate(['alb', 'api-gateway']);
    assert.equal(
      combo, albOnly,
      'mergeTemplate(["alb", "api-gateway"]) should produce same result as mergeTemplate(["alb"])'
    );
  });

  it('combo does NOT produce template with both traffic layers', () => {
    const result = mergeTemplate(['alb', 'api-gateway']);
    assert.ok(
      result.includes('ElasticLoadBalancingV2::LoadBalancer'),
      'should contain ALB'
    );
    assert.ok(
      !result.includes('AWS::Serverless::Api'),
      'should NOT contain API Gateway'
    );
  });
});

// -----------------------------------------------------------
// Template merging — alb reserved concurrency value
// -----------------------------------------------------------

describe('template merging — alb reserved concurrency value', () => {
  it('test_alb_reserved_concurrency_value_is_50: integer 50, not string', () => {
    const result = mergeTemplate(['alb']);
    const match = result.match(
      /ReservedConcurrentExecutions:\s*(\S+)/
    );
    assert.ok(
      match,
      'should contain ReservedConcurrentExecutions'
    );
    assert.equal(
      match[1], '50',
      `ReservedConcurrentExecutions should be 50, got: ${match[1]}`
    );
    assert.ok(
      !match[1].startsWith('"') && !match[1].startsWith("'"),
      'value should not be a quoted string'
    );
  });
});

// -----------------------------------------------------------
// Template merging — unknown extension
// -----------------------------------------------------------

describe('template merging — unknown extension', () => {
  it('mergeTemplate(["nonexistent"]) throws an error', () => {
    assert.throws(
      () => mergeTemplate(['nonexistent']),
      'mergeTemplate should throw for unknown extensions'
    );
  });
});

// -----------------------------------------------------------
// Template merging — CloudFormation tag preservation
// -----------------------------------------------------------

describe('template merging — CloudFormation tag preservation', () => {
  it('output string contains !Sub tags', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      result.includes('!Sub'),
      'merged template should preserve !Sub CloudFormation tags'
    );
  });

  it('output string contains !Ref tags', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      result.includes('!Ref'),
      'merged template should preserve !Ref CloudFormation tags'
    );
  });

  it('output string contains !GetAtt tags', () => {
    const result = mergeTemplate(['alb']);
    assert.ok(
      result.includes('!GetAtt'),
      'merged template should preserve !GetAtt CloudFormation tags'
    );
  });
});

// -----------------------------------------------------------
// Template resolution
// -----------------------------------------------------------

describe('template resolution', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
    delete process.env.BOA_TEMPLATE_OVERRIDE;
  });

  it('returns .boa/template.yaml when it exists', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-resolve-'));
    const boaDir = join(tmpDir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    const templatePath = join(boaDir, 'template.yaml');
    writeFileSync(templatePath, 'test: true\n');

    const result = resolveTemplate(tmpDir);
    assert.equal(
      result, templatePath,
      'should return path to .boa/template.yaml when it exists'
    );
  });

  it('returns bundled default when .boa/template.yaml does not exist', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-resolve-'));
    const result = resolveTemplate(tmpDir);
    assert.ok(
      result.includes('templates/backend.yaml'),
      `should return bundled default template path, got: ${result}`
    );
  });

  it('BOA_TEMPLATE_OVERRIDE takes precedence over everything', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-resolve-'));
    const boaDir = join(tmpDir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(join(boaDir, 'template.yaml'), 'test: true\n');

    const overridePath = '/tmp/custom-template.yaml';
    process.env.BOA_TEMPLATE_OVERRIDE = overridePath;

    const result = resolveTemplate(tmpDir);
    assert.equal(
      result, overridePath,
      'should return BOA_TEMPLATE_OVERRIDE path when set'
    );
  });
});
