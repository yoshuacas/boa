import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { packageFunctions } from '../lib/functions/package.mjs';

describe('functions package', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function setupProject(functions) {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-package-'));
    mkdirSync(join(tmpDir, 'functions'), { recursive: true });

    for (const fn of functions) {
      const fnDir = join(tmpDir, 'functions', fn.name);
      mkdirSync(fnDir, { recursive: true });
      writeFileSync(
        join(fnDir, 'index.mjs'),
        fn.code || 'export default async function handler() { return { status: 200, body: {} }; }'
      );
      if (fn.siblings) {
        for (const [name, content] of Object.entries(fn.siblings)) {
          writeFileSync(join(fnDir, name), content);
        }
      }
      if (fn.nodeModules) {
        mkdirSync(join(fnDir, 'node_modules', 'some-pkg'), { recursive: true });
        writeFileSync(
          join(fnDir, 'node_modules', 'some-pkg', 'index.js'),
          'module.exports = {};'
        );
      }
    }

    return tmpDir;
  }

  it('packages two functions with runtime files and registry', async () => {
    const root = setupProject([
      { name: 'hello' },
      { name: 'other' },
    ]);

    const descriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256, path: join(root, 'functions', 'hello') },
      { name: 'other', visibility: 'public', timeout: 30, memory: 256, path: join(root, 'functions', 'other') },
    ];

    const result = await packageFunctions(descriptors, { projectRoot: root });

    assert.ok(result.zipBuffer || result.zipPath, 'should produce a zip');
    const entries = result.entries || [];
    const entryNames = entries.map((e) => e.name || e);

    assert.ok(entryNames.includes('handler.mjs'), 'zip should contain handler.mjs');
    assert.ok(entryNames.includes('ctx.mjs'), 'zip should contain ctx.mjs');
    assert.ok(entryNames.includes('boa-client.mjs'), 'zip should contain boa-client.mjs');
    assert.ok(entryNames.includes('logger.mjs'), 'zip should contain logger.mjs');
    assert.ok(entryNames.includes('_registry.json'), 'zip should contain _registry.json');
    assert.ok(
      entryNames.some((n) => n.includes('functions/hello/index.mjs')),
      'zip should contain functions/hello/index.mjs'
    );
    assert.ok(
      entryNames.some((n) => n.includes('functions/other/index.mjs')),
      'zip should contain functions/other/index.mjs'
    );
  });

  it('excludes node_modules from function directories', async () => {
    const root = setupProject([
      { name: 'hello', nodeModules: true },
    ]);

    const descriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256, path: join(root, 'functions', 'hello') },
    ];

    const result = await packageFunctions(descriptors, { projectRoot: root });

    const entries = result.entries || [];
    const entryNames = entries.map((e) => e.name || e);
    const hasNodeModules = entryNames.some((n) => n.includes('node_modules'));
    assert.ok(!hasNodeModules, 'zip should NOT contain node_modules');
  });

  it('computes shared max timeout from all functions', async () => {
    const root = setupProject([
      { name: 'fast' },
      { name: 'slow' },
    ]);

    const descriptors = [
      { name: 'fast', visibility: 'public', timeout: 10, memory: 256, path: join(root, 'functions', 'fast') },
      { name: 'slow', visibility: 'public', timeout: 25, memory: 256, path: join(root, 'functions', 'slow') },
    ];

    const result = await packageFunctions(descriptors, { projectRoot: root });

    assert.equal(result.maxTimeout, 25);
  });

  it('computes shared max memory from all functions', async () => {
    const root = setupProject([
      { name: 'small' },
      { name: 'large' },
    ]);

    const descriptors = [
      { name: 'small', visibility: 'public', timeout: 30, memory: 128, path: join(root, 'functions', 'small') },
      { name: 'large', visibility: 'public', timeout: 30, memory: 512, path: join(root, 'functions', 'large') },
    ];

    const result = await packageFunctions(descriptors, { projectRoot: root });

    assert.equal(result.maxMemory, 512);
  });

  it('produces deterministic zip hash for same input', async () => {
    const root = setupProject([
      { name: 'hello' },
      { name: 'other' },
    ]);

    const descriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256, path: join(root, 'functions', 'hello') },
      { name: 'other', visibility: 'public', timeout: 30, memory: 256, path: join(root, 'functions', 'other') },
    ];

    const result1 = await packageFunctions(descriptors, { projectRoot: root });
    const result2 = await packageFunctions(descriptors, { projectRoot: root });

    const hash1 = createHash('sha256').update(result1.zipBuffer).digest('hex');
    const hash2 = createHash('sha256').update(result2.zipBuffer).digest('hex');
    assert.equal(hash1, hash2, 'same input should produce same zip hash');
  });

  it('includes sibling files alongside index.mjs', async () => {
    const root = setupProject([
      { name: 'hello', siblings: { 'utils.mjs': 'export const add = (a, b) => a + b;' } },
    ]);

    const descriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256, path: join(root, 'functions', 'hello') },
    ];

    const result = await packageFunctions(descriptors, { projectRoot: root });

    const entries = result.entries || [];
    const entryNames = entries.map((e) => e.name || e);
    assert.ok(
      entryNames.some((n) => n.includes('functions/hello/utils.mjs')),
      'zip should contain sibling utils.mjs'
    );
  });

  it('empty descriptors returns sane defaults not -Infinity', async () => {
    const result = await packageFunctions([]);

    assert.equal(result.maxTimeout, 30, 'default maxTimeout should be 30');
    assert.equal(result.maxMemory, 256, 'default maxMemory should be 256');
  });
});
