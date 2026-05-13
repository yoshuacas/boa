import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeParamsFile } from '../lib/deploy.mjs';

describe('writeParamsFile', () => {
  it('preserves commas inside ParameterValue', () => {
    const file = writeParamsFile({
      ProjectName: 'cyclewaze',
      AllowedOrigins: 'http://localhost:5173,https://prod.example.com',
    });
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const allowed = parsed.find((p) => p.ParameterKey === 'AllowedOrigins');
    assert.equal(allowed.ParameterValue, 'http://localhost:5173,https://prod.example.com');
    assert.equal(parsed.length, 2);
  });

  it('filters out null and empty-string values', () => {
    const file = writeParamsFile({
      ProjectName: 'test',
      Empty: '',
      Null: null,
      Undef: undefined,
      Valid: 'value',
    });
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(parsed.length, 2);
    assert.deepEqual(
      parsed.map((p) => p.ParameterKey).sort(),
      ['ProjectName', 'Valid'],
    );
  });

  it('converts non-string values to strings', () => {
    const file = writeParamsFile({ Port: 8080, Enabled: true });
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(parsed.find((p) => p.ParameterKey === 'Port').ParameterValue, '8080');
    assert.equal(parsed.find((p) => p.ParameterKey === 'Enabled').ParameterValue, 'true');
  });

  it('returns empty array for no valid params', () => {
    const file = writeParamsFile({ Empty: '', Null: null });
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(parsed, []);
  });

  it('produces valid JSON that the AWS CLI file:// protocol accepts', () => {
    const file = writeParamsFile({
      ProjectName: 'myapp',
      LambdaS3Bucket: 'boa-cli-artifacts-123-us-east-1',
      LambdaS3Key: 'lambda/abc123.zip',
      AllowedOrigins: 'http://localhost:5173,https://prod.d2tdp0t0w0ur3n.amplifyapp.com',
    });
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(parsed.length, 4);
    for (const entry of parsed) {
      assert.ok(entry.ParameterKey, 'each entry must have ParameterKey');
      assert.ok(typeof entry.ParameterValue === 'string', 'each value must be a string');
    }
  });
});
