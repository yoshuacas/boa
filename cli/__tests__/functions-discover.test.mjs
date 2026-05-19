import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discover } from '../lib/functions/discover.mjs';

describe('functions discover', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function setupProject() {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-discover-'));
    mkdirSync(join(tmpDir, 'functions'), { recursive: true });
    return tmpDir;
  }

  it('discovers hello/index.mjs with default config', async () => {
    const root = setupProject();
    mkdirSync(join(root, 'functions', 'hello'));
    writeFileSync(
      join(root, 'functions', 'hello', 'index.mjs'),
      'export default async function handler(req, ctx) { return { status: 200, body: {} }; }'
    );

    const result = await discover(join(root, 'functions'));

    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'hello');
    assert.equal(result[0].visibility, 'public');
    assert.equal(result[0].timeout, 30);
    assert.equal(result[0].memory, 256);
  });

  it('boa.json overrides default config', async () => {
    const root = setupProject();
    mkdirSync(join(root, 'functions', 'hello'));
    writeFileSync(
      join(root, 'functions', 'hello', 'index.mjs'),
      'export default async function handler(req, ctx) { return { status: 200, body: {} }; }'
    );
    writeFileSync(
      join(root, 'functions', 'hello', 'boa.json'),
      JSON.stringify({ visibility: 'private', timeout: 10, memory: 512 })
    );

    const result = await discover(join(root, 'functions'));

    assert.equal(result[0].visibility, 'private');
    assert.equal(result[0].timeout, 10);
    assert.equal(result[0].memory, 512);
  });

  it('rejects invalid function name My_Func', async () => {
    const root = setupProject();
    mkdirSync(join(root, 'functions', 'My_Func'));
    writeFileSync(
      join(root, 'functions', 'My_Func', 'index.mjs'),
      'export default async function handler() { return { status: 200, body: {} }; }'
    );

    await assert.rejects(
      () => discover(join(root, 'functions')),
      (err) => {
        assert.ok(
          err.message.includes("Invalid function name 'My_Func'"),
          `Expected invalid name error, got: ${err.message}`
        );
        assert.ok(
          err.message.includes('[a-z][a-z0-9-]{0,62}'),
          `Expected pattern in error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('rejects reserved name v1', async () => {
    const root = setupProject();
    mkdirSync(join(root, 'functions', 'v1'));
    writeFileSync(
      join(root, 'functions', 'v1', 'index.mjs'),
      'export default async function handler() { return { status: 200, body: {} }; }'
    );

    await assert.rejects(
      () => discover(join(root, 'functions')),
      (err) => {
        assert.ok(
          err.message.includes("Reserved function name 'v1'"),
          `Expected reserved name error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('rejects reserved name health', async () => {
    const root = setupProject();
    mkdirSync(join(root, 'functions', 'health'));
    writeFileSync(
      join(root, 'functions', 'health', 'index.mjs'),
      'export default async function handler() { return { status: 200, body: {} }; }'
    );

    await assert.rejects(
      () => discover(join(root, 'functions')),
      (err) => {
        assert.ok(
          err.message.includes("Reserved function name 'health'"),
          `Expected reserved name error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('rejects _internal by reserved name check (not pattern check)', async () => {
    const root = setupProject();
    mkdirSync(join(root, 'functions', '_internal'));
    writeFileSync(
      join(root, 'functions', '_internal', 'index.mjs'),
      'export default async function handler() { return { status: 200, body: {} }; }'
    );

    await assert.rejects(
      () => discover(join(root, 'functions')),
      (err) => {
        assert.ok(
          err.message.includes("Reserved function name '_internal'"),
          `Expected reserved name error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('rejects directory without index.mjs', async () => {
    const root = setupProject();
    mkdirSync(join(root, 'functions', 'broken'));

    await assert.rejects(
      () => discover(join(root, 'functions')),
      (err) => {
        assert.ok(
          err.message.includes('broken') && err.message.includes('index.mjs'),
          `Expected missing entry point error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('rejects when declared secret does not exist in SSM', async () => {
    const root = setupProject();
    mkdirSync(join(root, 'functions', 'hello'));
    writeFileSync(
      join(root, 'functions', 'hello', 'index.mjs'),
      'export default async function handler() { return { status: 200, body: {} }; }'
    );
    writeFileSync(
      join(root, 'functions', 'hello', 'boa.json'),
      JSON.stringify({ secrets: ['STRIPE_KEY'] })
    );

    const mockSsmCheck = async () => {
      throw new Error('ParameterNotFound');
    };

    await assert.rejects(
      () => discover(join(root, 'functions'), {
        validateSecrets: true,
        stackName: 'my-stack',
        ssmGetParameter: mockSsmCheck,
      }),
      (err) => {
        assert.ok(
          err.message.includes('/my-stack/functions/hello/STRIPE_KEY'),
          `Expected SSM path in error, got: ${err.message}`
        );
        assert.ok(
          err.message.includes('aws ssm put-parameter')
            || err.message.includes('put-parameter'),
          `Expected remediation hint, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('empty functions/ directory returns empty array', async () => {
    const root = setupProject();

    const result = await discover(join(root, 'functions'));

    assert.deepEqual(result, []);
  });

  it('rejects invalid visibility value', async () => {
    const root = setupProject();
    mkdirSync(join(root, 'functions', 'hello'));
    writeFileSync(
      join(root, 'functions', 'hello', 'index.mjs'),
      'export default async function handler() { return { status: 200, body: {} }; }'
    );
    writeFileSync(
      join(root, 'functions', 'hello', 'boa.json'),
      JSON.stringify({ visibility: 'internal' })
    );

    await assert.rejects(
      () => discover(join(root, 'functions')),
      (err) => {
        assert.ok(
          err.message.includes('visibility')
            && (err.message.includes('public') || err.message.includes('private')),
          `Expected visibility validation error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('rejects timeout below minimum (0)', async () => {
    const root = setupProject();
    mkdirSync(join(root, 'functions', 'hello'));
    writeFileSync(
      join(root, 'functions', 'hello', 'index.mjs'),
      'export default async function handler() { return { status: 200, body: {} }; }'
    );
    writeFileSync(
      join(root, 'functions', 'hello', 'boa.json'),
      JSON.stringify({ timeout: 0 })
    );

    await assert.rejects(
      () => discover(join(root, 'functions')),
      (err) => {
        assert.ok(
          err.message.includes('timeout'),
          `Expected timeout validation error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('rejects memory above maximum (2048)', async () => {
    const root = setupProject();
    mkdirSync(join(root, 'functions', 'hello'));
    writeFileSync(
      join(root, 'functions', 'hello', 'index.mjs'),
      'export default async function handler() { return { status: 200, body: {} }; }'
    );
    writeFileSync(
      join(root, 'functions', 'hello', 'boa.json'),
      JSON.stringify({ memory: 2048 })
    );

    await assert.rejects(
      () => discover(join(root, 'functions')),
      (err) => {
        assert.ok(
          err.message.includes('memory'),
          `Expected memory validation error, got: ${err.message}`
        );
        return true;
      }
    );
  });
});
