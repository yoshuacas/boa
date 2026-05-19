import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from '../lib/functions/registry.mjs';

describe('functions registry', () => {
  it('builds registry with both entries including visibility, timeout, memory', () => {
    const descriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256 },
      { name: 'cleanup', visibility: 'private', timeout: 10, memory: 128 },
    ];

    const registry = buildRegistry(descriptors);

    assert.ok(registry.hello);
    assert.equal(registry.hello.visibility, 'public');
    assert.equal(registry.hello.timeout, 30);
    assert.equal(registry.hello.memory, 256);

    assert.ok(registry.cleanup);
    assert.equal(registry.cleanup.visibility, 'private');
    assert.equal(registry.cleanup.timeout, 10);
    assert.equal(registry.cleanup.memory, 128);
  });

  it('rejects reserved name as defense in depth', () => {
    const descriptors = [
      { name: 'v1', visibility: 'public', timeout: 30, memory: 256 },
    ];

    assert.throws(
      () => buildRegistry(descriptors),
      (err) => {
        assert.ok(
          err.message.includes('v1'),
          `Expected reserved name error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('private functions are present in registry JSON', () => {
    const descriptors = [
      { name: 'secret-job', visibility: 'private', timeout: 30, memory: 256 },
    ];

    const registry = buildRegistry(descriptors);

    assert.ok(registry['secret-job']);
    assert.equal(registry['secret-job'].visibility, 'private');
  });

  it('empty function list returns empty object', () => {
    const registry = buildRegistry([]);

    assert.deepEqual(registry, {});
  });
});
