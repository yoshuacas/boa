import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { needsMigrationWarning } from '../commands/deploy.mjs';

describe('deploy migration warning', () => {
  it('CloudFront config without alb triggers warning', () => {
    assert.ok(needsMigrationWarning({
      apiUrl: 'https://d111.cloudfront.net',
      cloudfront: { distributionId: 'E123' },
      extensions: [],
    }));
  });

  it('Function URL without alb triggers warning', () => {
    assert.ok(needsMigrationWarning({
      apiUrl: 'https://abc123.lambda-url.us-east-1.on.aws/',
      extensions: [],
    }));
  });

  it('API Gateway URL without api-gateway extension triggers warning', () => {
    assert.ok(needsMigrationWarning({
      apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
      extensions: [],
    }));
  });

  it('API Gateway URL with api-gateway extension does not trigger warning', () => {
    assert.ok(!needsMigrationWarning({
      apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
      extensions: ['api-gateway'],
    }));
  });

  it('ALB URL with alb config does not trigger warning', () => {
    assert.ok(!needsMigrationWarning({
      apiUrl: 'http://my-alb-123.us-east-1.elb.amazonaws.com',
      alb: { arn: 'arn:aws:elasticloadbalancing:...' },
      extensions: [],
    }));
  });

  it('no apiUrl does not trigger warning', () => {
    assert.ok(!needsMigrationWarning({
      extensions: [],
    }));
  });

  it('no extensions field with API Gateway URL triggers warning', () => {
    assert.ok(needsMigrationWarning({
      apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
    }));
  });
});
