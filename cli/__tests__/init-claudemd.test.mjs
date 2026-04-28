import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateClaudeMd } from '../commands/init.mjs';

describe('generated CLAUDE.md content', () => {
  const cfg = {
    apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    serviceRoleKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.svc',
    authProvider: 'better-auth',
    pgrestLambdaVersion: '1.0.0',
    bucketName: 'test-storage-123',
    dsqlEndpoint: 'abc123.dsql.us-east-1.on.aws',
    region: 'us-east-1',
  };

  it('test_generated_claudemd_extend_example_uses_alb', () => {
    const md = generateClaudeMd('test-app', cfg);
    assert.ok(
      md.includes('(e.g., alb)'),
      `generated CLAUDE.md should reference alb in extend example, got substring: ${md.substring(md.indexOf('boa extend'), md.indexOf('boa extend') + 80)}`
    );
    assert.ok(
      !md.includes('(e.g., api-gateway)'),
      'generated CLAUDE.md should NOT reference api-gateway in extend example'
    );
  });

  it('architecture diagram references API Gateway REST', () => {
    const md = generateClaudeMd('test-app', cfg);
    assert.ok(
      md.includes('API Gateway REST + WAF'),
      'architecture diagram should mention API Gateway REST + WAF'
    );
    assert.ok(
      !md.includes('ALB + WAF (DDoS'),
      'architecture diagram should NOT mention ALB + WAF as default'
    );
  });

  it('config section references API Gateway endpoint', () => {
    const md = generateClaudeMd('test-app', cfg);
    assert.ok(
      md.includes('API Gateway endpoint'),
      'config section should say API Gateway endpoint'
    );
    assert.ok(
      !md.includes('ALB endpoint'),
      'config section should NOT say ALB endpoint'
    );
  });
});
