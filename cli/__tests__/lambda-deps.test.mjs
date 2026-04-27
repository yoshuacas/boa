import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePinnedVersion } from '../lib/lambda-deps.mjs';

describe('lambda dependency pinning', () => {
  it('accepts exact npm versions', () => {
    assert.equal(parsePinnedVersion('0.1.0'), '0.1.0');
    assert.equal(parsePinnedVersion('12.34.56'), '12.34.56');
  });

  it('rejects version ranges and dist-tags', () => {
    assert.equal(parsePinnedVersion('^0.1.0'), null);
    assert.equal(parsePinnedVersion('~0.1.0'), null);
    assert.equal(parsePinnedVersion('latest'), null);
  });

  it('rejects GitHub dependencies', () => {
    assert.equal(
      parsePinnedVersion('github:yoshuacas/pgrest-lambda#v0.2.0'),
      null
    );
    assert.equal(
      parsePinnedVersion('github:yoshuacas/pgrest-lambda'),
      null
    );
  });
});
