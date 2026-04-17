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
  it('getRegistry returns an object with an api-gateway key', () => {
    const registry = getRegistry();
    assert.ok(
      'api-gateway' in registry,
      'registry should have an "api-gateway" key'
    );
  });

  it('api-gateway entry has a description string', () => {
    const entry = getRegistry()['api-gateway'];
    assert.ok(entry, 'api-gateway entry should exist');
    assert.equal(
      typeof entry.description, 'string',
      'api-gateway.description should be a string'
    );
    assert.ok(
      entry.description.length > 0,
      'description should not be empty'
    );
  });

  it('api-gateway entry has a fragmentPath pointing to a file that exists', () => {
    const entry = getRegistry()['api-gateway'];
    assert.ok(entry, 'api-gateway entry should exist');
    assert.equal(
      typeof entry.fragmentPath, 'string',
      'api-gateway.fragmentPath should be a string'
    );
    assert.ok(
      existsSync(entry.fragmentPath),
      `fragmentPath should point to an existing file: ${entry.fragmentPath}`
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

  it('mergeTemplate([]) result contains ALB resources', () => {
    const result = mergeTemplate([]);
    assert.ok(
      result.includes('ApplicationLoadBalancer'),
      'base template should contain ApplicationLoadBalancer'
    );
    assert.ok(
      result.includes('WafWebAcl'),
      'base template should contain WafWebAcl'
    );
    assert.ok(
      result.includes('WafAlbAssociation'),
      'base template should contain WafAlbAssociation'
    );
    assert.ok(
      result.includes('AlbTargetGroup'),
      'base template should contain AlbTargetGroup'
    );
  });

  it('mergeTemplate([]) result does NOT contain Api resource', () => {
    const result = mergeTemplate([]);
    assert.ok(
      result.length > 0,
      'mergeTemplate([]) should return a non-empty template string'
    );
    const hasApiResource = /^\s{2}Api:\s*$/m.test(result);
    assert.ok(
      !hasApiResource,
      'merged template should NOT contain a standalone Api resource'
    );
  });

  it('mergeTemplate([]) result contains AlbUrl in Outputs', () => {
    const result = mergeTemplate([]);
    assert.ok(
      result.includes('AlbUrl'),
      'merged template should contain AlbUrl in Outputs'
    );
  });
});

// -----------------------------------------------------------
// Template merging — api-gateway extension
// -----------------------------------------------------------

describe('template merging — api-gateway extension', () => {
  it('result contains an Api resource (AWS::Serverless::Api)', () => {
    const result = mergeTemplate(['api-gateway']);
    assert.ok(
      result.includes('AWS::Serverless::Api'),
      'merged template should contain AWS::Serverless::Api'
    );
  });

  it('result contains Events on ApiFunction with ProxyRoot and ProxyPlus', () => {
    const result = mergeTemplate(['api-gateway']);
    assert.ok(
      result.includes('ProxyRoot'),
      'merged template should contain ProxyRoot event'
    );
    assert.ok(
      result.includes('ProxyPlus'),
      'merged template should contain ProxyPlus event'
    );
  });

  it('result contains ApiGatewayUrl in Outputs', () => {
    const result = mergeTemplate(['api-gateway']);
    assert.ok(
      result.includes('ApiGatewayUrl'),
      'merged template should contain ApiGatewayUrl in Outputs'
    );
  });

  it('result does NOT contain ApplicationLoadBalancer', () => {
    const result = mergeTemplate(['api-gateway']);
    assert.ok(
      !result.includes('ApplicationLoadBalancer'),
      'merged template should NOT contain ApplicationLoadBalancer'
        + ' when api-gateway extension is active'
    );
  });

  it('result does NOT contain ALB VPC resources', () => {
    const result = mergeTemplate(['api-gateway']);
    assert.ok(
      !result.includes('AlbVpc'),
      'merged template should NOT contain AlbVpc'
    );
    assert.ok(
      !result.includes('AlbSecurityGroup'),
      'merged template should NOT contain AlbSecurityGroup'
    );
  });

  it('result does NOT contain WafAlbAssociation', () => {
    const result = mergeTemplate(['api-gateway']);
    assert.ok(
      !result.includes('WafAlbAssociation'),
      'merged template should NOT contain WafAlbAssociation'
    );
  });

  it('result does NOT contain ReservedConcurrentExecutions', () => {
    const result = mergeTemplate(['api-gateway']);
    assert.ok(
      !result.includes('ReservedConcurrentExecutions'),
      'merged template should NOT contain'
        + ' ReservedConcurrentExecutions when api-gateway is active'
    );
  });

  it('result does NOT contain AlbUrl output', () => {
    const result = mergeTemplate(['api-gateway']);
    assert.ok(
      !result.includes('AlbUrl'),
      'merged template should NOT contain AlbUrl output'
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
    const result = mergeTemplate(['api-gateway']);
    assert.ok(
      result.includes('!Sub'),
      'merged template should preserve !Sub CloudFormation tags'
    );
  });

  it('output string contains !Ref tags', () => {
    const result = mergeTemplate(['api-gateway']);
    assert.ok(
      result.includes('!Ref'),
      'merged template should preserve !Ref CloudFormation tags'
    );
  });

  it('output string contains !GetAtt tags', () => {
    const result = mergeTemplate(['api-gateway']);
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
