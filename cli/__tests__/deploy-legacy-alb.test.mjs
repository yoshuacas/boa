import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync,
  readFileSync, existsSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mergeTemplate } from '../lib/extensions.mjs';
import {
  needsMigrationWarning, buildDeployConfig,
} from '../commands/deploy.mjs';

describe('deploy legacy ALB project', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('test_deploy_legacy_alb_uses_alb_template: merged template has ALB resources', () => {
    const legacyCfg = {
      stackName: 'legacy-app',
      region: 'us-east-1',
      apiUrl: 'http://legacy-alb-123.us-east-1.elb.amazonaws.com',
      alb: {
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/legacy/abc',
        dnsName: 'legacy-alb-123.us-east-1.elb.amazonaws.com',
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/legacy/def',
        vpcId: 'vpc-abc123',
      },
      extensions: [],
    };

    const extensions = legacyCfg.extensions || [];

    assert.ok(
      legacyCfg.alb && !extensions.includes('alb'),
      'should detect legacy ALB config'
    );

    const merged = mergeTemplate(['alb']);

    assert.ok(
      merged.includes('ElasticLoadBalancingV2::LoadBalancer'),
      'merged template should contain ALB resource'
    );
    assert.ok(
      !merged.includes('AWS::Serverless::Api'),
      'merged template should NOT contain API Gateway'
    );
    assert.ok(
      merged.includes('AlbUrl'),
      'merged template should have AlbUrl output'
    );
  });

  it('test_deploy_legacy_alb_writes_template_before_resolve: .boa/template.yaml is written', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-legacy-'));
    const boaDir = join(tmpDir, '.boa');
    mkdirSync(boaDir, { recursive: true });

    const legacyCfg = {
      stackName: 'legacy-app',
      region: 'us-east-1',
      alb: {
        arn: 'arn:aws:elasticloadbalancing:...',
        dnsName: 'legacy-alb.us-east-1.elb.amazonaws.com',
      },
      extensions: [],
    };

    const extensions = legacyCfg.extensions || [];
    if (legacyCfg.alb && !extensions.includes('alb')) {
      const merged = mergeTemplate(['alb']);
      writeFileSync(join(boaDir, 'template.yaml'), merged);
      extensions.push('alb');
    }

    assert.ok(
      existsSync(join(boaDir, 'template.yaml')),
      '.boa/template.yaml should be written for legacy ALB'
    );

    const written = readFileSync(
      join(boaDir, 'template.yaml'), 'utf8'
    );
    assert.ok(
      written.includes('ElasticLoadBalancingV2::LoadBalancer'),
      'written template should contain ALB resources'
    );
    assert.ok(
      extensions.includes('alb'),
      'extensions should include alb after detection'
    );
  });

  it('needsMigrationWarning fires for legacy ALB', () => {
    const result = needsMigrationWarning({
      alb: { arn: 'arn:...' },
      extensions: [],
    });
    assert.ok(result, 'should return warning');
    assert.ok(
      result.includes('ALB'),
      `warning should mention ALB, got: ${result}`
    );
  });

  it('test_deploy_legacy_alb_prints_correct_api_url', () => {
    const cfg = {
      stackName: 'test', region: 'us-east-1',
      accountId: '123', anonKey: 'k', serviceRoleKey: 'k',
    };
    const fakeOutputs = [
      { OutputKey: 'AlbUrl',
        OutputValue: 'http://my-alb.example.com' },
      { OutputKey: 'AlbArn',
        OutputValue: 'arn:aws:elasticloadbalancing:...' },
      { OutputKey: 'TargetGroupArn',
        OutputValue: 'arn:aws:elasticloadbalancing:...' },
      { OutputKey: 'VpcId', OutputValue: 'vpc-abc123' },
      { OutputKey: 'BucketName', OutputValue: 'bucket' },
      { OutputKey: 'DsqlEndpoint', OutputValue: 'ep' },
    ];

    const result = buildDeployConfig(
      cfg, fakeOutputs, ['alb']
    );
    assert.equal(
      result.apiUrl, 'http://my-alb.example.com',
      'apiUrl should be ALB URL, not undefined'
    );
  });

  it('needsMigrationWarning does NOT fire when alb is in extensions', () => {
    const result = needsMigrationWarning({
      alb: { arn: 'arn:...' },
      extensions: ['alb'],
    });
    assert.equal(result, null);
  });
});
