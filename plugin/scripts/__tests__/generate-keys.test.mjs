import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, '..', 'generate-keys.mjs');
const TEST_SECRET = 'test-secret-for-keygen-32bytes!!';

// Helper: decode JWT payload without verification
function decodePayload(token) {
  const parts = token.split('.');
  assert.equal(parts.length, 3, 'JWT should have 3 parts');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
}

// Helper: verify JWT signature with HMAC-SHA256
function verifySignature(token, secret) {
  const parts = token.split('.');
  const signInput = parts[0] + '.' + parts[1];
  const expectedSig = createHmac('sha256', secret)
    .update(signInput)
    .digest('base64url');
  return expectedSig === parts[2];
}

describe('generate-keys.mjs', () => {
  it('outputs valid JSON with anonKey and serviceRoleKey', async () => {
    const { stdout } = await execFileAsync(
      'node',
      [SCRIPT_PATH, TEST_SECRET]
    );
    const output = JSON.parse(stdout);

    assert.ok(output.anonKey, 'should have anonKey');
    assert.ok(output.serviceRoleKey, 'should have serviceRoleKey');
    assert.equal(
      typeof output.anonKey,
      'string',
      'anonKey should be a string'
    );
    assert.equal(
      typeof output.serviceRoleKey,
      'string',
      'serviceRoleKey should be a string'
    );
  });

  it('anonKey decodes to {role: "anon", iss: "boa"} with ~10-year expiry', async () => {
    const { stdout } = await execFileAsync(
      'node',
      [SCRIPT_PATH, TEST_SECRET]
    );
    const { anonKey } = JSON.parse(stdout);
    const payload = decodePayload(anonKey);

    assert.equal(
      payload.role,
      'anon',
      'anonKey role should be anon'
    );
    assert.equal(
      payload.iss,
      'boa',
      'anonKey issuer should be boa'
    );

    // ~10 year expiry: exp - iat ≈ 315360000 (10 * 365 * 24 * 3600)
    const tenYears = 10 * 365 * 24 * 3600;
    const diff = payload.exp - payload.iat;
    assert.ok(
      diff >= tenYears - 100 && diff <= tenYears + 100,
      `anonKey expiry should be ~10 years (got ${diff}s)`
    );
  });

  it('serviceRoleKey decodes to {role: "service_role", iss: "boa"} with ~10-year expiry', async () => {
    const { stdout } = await execFileAsync(
      'node',
      [SCRIPT_PATH, TEST_SECRET]
    );
    const { serviceRoleKey } = JSON.parse(stdout);
    const payload = decodePayload(serviceRoleKey);

    assert.equal(
      payload.role,
      'service_role',
      'serviceRoleKey role should be service_role'
    );
    assert.equal(
      payload.iss,
      'boa',
      'serviceRoleKey issuer should be boa'
    );

    const tenYears = 10 * 365 * 24 * 3600;
    const diff = payload.exp - payload.iat;
    assert.ok(
      diff >= tenYears - 100 && diff <= tenYears + 100,
      `serviceRoleKey expiry should be ~10 years (got ${diff}s)`
    );
  });

  it('both keys have valid HMAC-SHA256 signatures', async () => {
    const { stdout } = await execFileAsync(
      'node',
      [SCRIPT_PATH, TEST_SECRET]
    );
    const { anonKey, serviceRoleKey } = JSON.parse(stdout);

    assert.ok(
      verifySignature(anonKey, TEST_SECRET),
      'anonKey signature should be valid'
    );
    assert.ok(
      verifySignature(serviceRoleKey, TEST_SECRET),
      'serviceRoleKey signature should be valid'
    );
  });

  it('exits with non-zero code and prints usage when no secret given', async () => {
    try {
      await execFileAsync('node', [SCRIPT_PATH]);
      assert.fail(
        'should have exited with non-zero code'
      );
    } catch (err) {
      assert.ok(
        err.code !== 0,
        'exit code should be non-zero'
      );
      assert.ok(
        err.stderr.length > 0,
        'should print usage to stderr'
      );
    }
  });
});
