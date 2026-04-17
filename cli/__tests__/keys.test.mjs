import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { generateKeys } from '../lib/keys.mjs';

function decodeJwtPayload(token) {
  const parts = token.split('.');
  assert.equal(parts.length, 3, 'JWT should have 3 segments');
  const payload = JSON.parse(
    Buffer.from(parts[1], 'base64url').toString()
  );
  return payload;
}

function decodeJwtHeader(token) {
  const parts = token.split('.');
  return JSON.parse(Buffer.from(parts[0], 'base64url').toString());
}

describe('generateKeys', () => {
  const secret = 'test-secret-for-unit-tests';

  it('returns an object with anonKey and serviceRoleKey', () => {
    const keys = generateKeys(secret);
    assert.ok(keys.anonKey, 'should have anonKey');
    assert.ok(keys.serviceRoleKey, 'should have serviceRoleKey');
  });

  it('anonKey payload contains role "anon"', () => {
    const { anonKey } = generateKeys(secret);
    const payload = decodeJwtPayload(anonKey);
    assert.equal(payload.role, 'anon');
  });

  it('anonKey payload contains iss "pgrest-lambda"', () => {
    const { anonKey } = generateKeys(secret);
    const payload = decodeJwtPayload(anonKey);
    assert.equal(payload.iss, 'pgrest-lambda');
  });

  it('anonKey has exp approximately 10 years from now', () => {
    const { anonKey } = generateKeys(secret);
    const payload = decodeJwtPayload(anonKey);
    const tenYears = 10 * 365 * 24 * 3600;
    const now = Math.floor(Date.now() / 1000);
    const expected = now + tenYears;
    assert.ok(
      Math.abs(payload.exp - expected) < 60,
      `exp ${payload.exp} should be within 60s of ${expected}`
    );
  });

  it('anonKey payload contains an iat field', () => {
    const { anonKey } = generateKeys(secret);
    const payload = decodeJwtPayload(anonKey);
    assert.ok(payload.iat !== undefined, 'should have iat field');
  });

  it('serviceRoleKey payload contains role "service_role"', () => {
    const { serviceRoleKey } = generateKeys(secret);
    const payload = decodeJwtPayload(serviceRoleKey);
    assert.equal(payload.role, 'service_role');
  });

  it('serviceRoleKey payload contains iss "pgrest-lambda"', () => {
    const { serviceRoleKey } = generateKeys(secret);
    const payload = decodeJwtPayload(serviceRoleKey);
    assert.equal(payload.iss, 'pgrest-lambda');
  });

  it('serviceRoleKey has exp approximately 10 years from now', () => {
    const { serviceRoleKey } = generateKeys(secret);
    const payload = decodeJwtPayload(serviceRoleKey);
    const tenYears = 10 * 365 * 24 * 3600;
    const now = Math.floor(Date.now() / 1000);
    const expected = now + tenYears;
    assert.ok(
      Math.abs(payload.exp - expected) < 60,
      `exp ${payload.exp} should be within 60s of ${expected}`
    );
  });

  it('HMAC-SHA256 signature verification succeeds', () => {
    const keys = generateKeys(secret);
    for (const token of [keys.anonKey, keys.serviceRoleKey]) {
      const parts = token.split('.');
      const signingInput = `${parts[0]}.${parts[1]}`;
      const expectedSig = createHmac('sha256', secret)
        .update(signingInput)
        .digest('base64url');
      assert.equal(
        parts[2],
        expectedSig,
        'signature should match HMAC-SHA256 recomputation'
      );
    }
  });

  it('two calls produce structurally valid keys', () => {
    const keys1 = generateKeys(secret);
    const keys2 = generateKeys(secret);
    for (const keys of [keys1, keys2]) {
      const anonPayload = decodeJwtPayload(keys.anonKey);
      const srPayload = decodeJwtPayload(keys.serviceRoleKey);
      assert.equal(anonPayload.role, 'anon');
      assert.equal(srPayload.role, 'service_role');
      const anonHeader = decodeJwtHeader(keys.anonKey);
      assert.equal(anonHeader.alg, 'HS256');
      assert.equal(anonHeader.typ, 'JWT');
    }
  });
});
