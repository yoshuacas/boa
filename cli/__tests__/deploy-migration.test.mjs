import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  needsMigrationWarning, buildDeployConfig,
} from '../commands/deploy.mjs';

describe('deploy migration warning', () => {
  it('alb block without extensions array triggers legacy ALB warning', () => {
    const result = needsMigrationWarning({
      alb: {
        arn: 'arn:aws:elasticloadbalancing:...',
        dnsName: 'my-alb.us-east-1.elb.amazonaws.com',
      },
    });
    assert.ok(
      result,
      'should return a warning string'
    );
    assert.ok(
      typeof result === 'string' && result.includes('ALB'),
      `warning should mention ALB, got: ${result}`
    );
  });

  it('alb block with extensions: ["alb"] does NOT trigger warning', () => {
    const result = needsMigrationWarning({
      alb: {
        arn: 'arn:aws:elasticloadbalancing:...',
        dnsName: 'my-alb.us-east-1.elb.amazonaws.com',
      },
      extensions: ['alb'],
    });
    assert.equal(
      result, null,
      'should return null when alb is explicit in extensions'
    );
  });

  it('apiGateway block does NOT trigger warning', () => {
    const result = needsMigrationWarning({
      apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
      apiGateway: { restApiId: 'abc123', stage: 'prod' },
      extensions: [],
    });
    assert.equal(
      result, null,
      'should return null for apiGateway config'
    );
  });

  it('cloudfront block triggers warning', () => {
    const result = needsMigrationWarning({
      apiUrl: 'https://d111.cloudfront.net',
      cloudfront: { distributionId: 'E123' },
      extensions: [],
    });
    assert.ok(
      result,
      'should return a warning for CloudFront config'
    );
    assert.ok(
      typeof result === 'string'
        && result.toLowerCase().includes('cloudfront'),
      `warning should mention CloudFront, got: ${result}`
    );
  });

  it('apiUrl with lambda-url triggers Function URL warning', () => {
    const result = needsMigrationWarning({
      apiUrl: 'https://abc123.lambda-url.us-east-1.on.aws/',
      extensions: [],
    });
    assert.ok(
      result,
      'should return a warning for Function URL config'
    );
  });

  it('no apiUrl does NOT trigger warning', () => {
    const result = needsMigrationWarning({
      extensions: [],
    });
    assert.equal(
      result, null,
      'should return null when no apiUrl is present'
    );
  });

  it('extensions: ["api-gateway"] without alb block does NOT trigger warning', () => {
    const result = needsMigrationWarning({
      apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
      extensions: ['api-gateway'],
    });
    assert.equal(
      result, null,
      'api-gateway in extensions is a legacy no-op, not a migration scenario'
    );
  });

  it('test_migration_warning_alb_block_with_api_gateway_extension', () => {
    const result = needsMigrationWarning({
      alb: {
        arn: 'arn:aws:elasticloadbalancing:...',
        dnsName: 'my-alb.us-east-1.elb.amazonaws.com',
      },
      extensions: ['api-gateway'],
    });
    assert.ok(
      result,
      'should return a warning when alb block exists with api-gateway extension'
    );
    assert.ok(
      typeof result === 'string' && result.includes('ALB'),
      `warning should mention ALB, got: ${result}`
    );
  });

  it('test_deploy_alb_missing_url_no_throw', () => {
    const cfg = {
      stackName: 'test', region: 'us-east-1',
      accountId: '123', anonKey: 'k', serviceRoleKey: 'k',
    };
    const fakeOutputs = [
      { OutputKey: 'AlbArn', OutputValue: 'arn:...' },
      { OutputKey: 'TargetGroupArn', OutputValue: 'arn:...' },
      { OutputKey: 'VpcId', OutputValue: 'vpc-abc123' },
      { OutputKey: 'BucketName', OutputValue: 'bucket' },
      { OutputKey: 'DsqlEndpoint', OutputValue: 'ep' },
    ];

    const result = buildDeployConfig(
      cfg, fakeOutputs, ['alb']
    );
    assert.equal(
      result.alb, undefined,
      'alb should be undefined when AlbUrl is missing'
    );
  });

  it('test_build_deploy_config_alb_outputs', () => {
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
        OutputValue: 'arn:aws:elasticloadbalancing:...:tg' },
      { OutputKey: 'VpcId', OutputValue: 'vpc-abc123' },
      { OutputKey: 'BucketName', OutputValue: 'bucket' },
      { OutputKey: 'DsqlEndpoint', OutputValue: 'ep' },
    ];

    const result = buildDeployConfig(
      cfg, fakeOutputs, ['alb']
    );
    assert.equal(result.apiUrl, 'http://my-alb.example.com');
    assert.ok(result.alb, 'should have alb block');
    assert.equal(result.alb.vpcId, 'vpc-abc123');
    assert.equal(result.apiGateway, undefined);
  });

  it('preserves allowedOrigins from prior config', () => {
    // Regression: buildDeployConfig used to silently drop
    // cfg.allowedOrigins, so each `boa deploy` wiped the CORS
    // allowlist from .boa/config.json and every subsequent deploy
    // re-deployed the Lambda with no CORS headers.
    const cfg = {
      stackName: 'test', region: 'us-east-1',
      accountId: '123', anonKey: 'k', serviceRoleKey: 'k',
      allowedOrigins: ['https://app.example.com', 'http://localhost:3000'],
    };
    const fakeOutputs = [
      { OutputKey: 'ApiGatewayUrl', OutputValue: 'https://x.example.com/prod' },
      { OutputKey: 'RestApiId', OutputValue: 'abc123' },
      { OutputKey: 'BucketName', OutputValue: 'bucket' },
      { OutputKey: 'DsqlEndpoint', OutputValue: 'ep' },
    ];

    const result = buildDeployConfig(cfg, fakeOutputs, []);
    assert.deepEqual(
      result.allowedOrigins,
      ['https://app.example.com', 'http://localhost:3000'],
      'allowedOrigins must round-trip through buildDeployConfig',
    );
  });

  it('preserves certificateArn from prior config', () => {
    const cfg = {
      stackName: 'test', region: 'us-east-1',
      accountId: '123', anonKey: 'k', serviceRoleKey: 'k',
      certificateArn: 'arn:aws:acm:us-east-1:123:certificate/xyz',
    };
    const fakeOutputs = [
      { OutputKey: 'ApiGatewayUrl', OutputValue: 'https://x.example.com/prod' },
      { OutputKey: 'RestApiId', OutputValue: 'abc123' },
      { OutputKey: 'BucketName', OutputValue: 'bucket' },
      { OutputKey: 'DsqlEndpoint', OutputValue: 'ep' },
    ];

    const result = buildDeployConfig(cfg, fakeOutputs, []);
    assert.equal(
      result.certificateArn,
      'arn:aws:acm:us-east-1:123:certificate/xyz',
      'certificateArn must round-trip through buildDeployConfig',
    );
  });

  it('omits allowedOrigins when absent or empty', () => {
    const cfg = {
      stackName: 'test', region: 'us-east-1',
      accountId: '123', anonKey: 'k', serviceRoleKey: 'k',
    };
    const fakeOutputs = [
      { OutputKey: 'ApiGatewayUrl', OutputValue: 'https://x/prod' },
      { OutputKey: 'BucketName', OutputValue: 'bucket' },
      { OutputKey: 'DsqlEndpoint', OutputValue: 'ep' },
    ];
    const result = buildDeployConfig(cfg, fakeOutputs, []);
    assert.equal(result.allowedOrigins, undefined);

    const result2 = buildDeployConfig(
      { ...cfg, allowedOrigins: [] }, fakeOutputs, [],
    );
    assert.equal(
      result2.allowedOrigins, undefined,
      'empty array should not round-trip as an empty array',
    );
  });
});
