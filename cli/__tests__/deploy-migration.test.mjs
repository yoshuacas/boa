import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { needsMigrationWarning } from '../commands/deploy.mjs';

describe('deploy migration warning', () => {
  it('API Gateway URL and no extensions → warning', () => {
    assert.ok(needsMigrationWarning({
      apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
      extensions: [],
    }));
  });

  it('API Gateway URL with api-gateway extension → no warning', () => {
    assert.ok(!needsMigrationWarning({
      apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
      extensions: ['api-gateway'],
    }));
  });

  it('Function URL without cloudfront → warning', () => {
    assert.ok(needsMigrationWarning({
      apiUrl: 'https://abc123.lambda-url.us-east-1.on.aws/',
      extensions: [],
    }));
  });

  it('Function URL with cloudfront → no warning', () => {
    assert.ok(!needsMigrationWarning({
      apiUrl: 'https://abc123.lambda-url.us-east-1.on.aws/',
      cloudfront: { distributionId: 'E123' },
      extensions: [],
    }));
  });

  it('CloudFront URL → no warning', () => {
    assert.ok(!needsMigrationWarning({
      apiUrl: 'https://d111111abcdef8.cloudfront.net',
      cloudfront: { distributionId: 'E123' },
      extensions: [],
    }));
  });

  it('no apiUrl → no warning', () => {
    assert.ok(!needsMigrationWarning({
      extensions: [],
    }));
  });

  it('no extensions field → warning if API Gateway URL', () => {
    assert.ok(needsMigrationWarning({
      apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
    }));
  });
});
