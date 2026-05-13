import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findSourceMaps } from '../lib/frontend.mjs';

let tempDir;

function makeTempDir() {
  tempDir = mkdtempSync(join(tmpdir(), 'boa-source-maps-'));
  return tempDir;
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe('findSourceMaps', () => {
  it('finds .js.map files in dist dir', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'index.js.map'), '{}');
    writeFileSync(join(dir, 'vendor.js.map'), '{}');
    const results = findSourceMaps(dir);
    assert.equal(results.length, 2, 'expected findSourceMaps to return both .map files');
    assert.ok(results.some((f) => f.includes('index.js.map')));
    assert.ok(results.some((f) => f.includes('vendor.js.map')));
  });

  it('finds .css.map files', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'styles.css.map'), '{}');
    const results = findSourceMaps(dir);
    assert.equal(results.length, 1, 'expected findSourceMaps to return .css.map files');
    assert.ok(results[0].includes('styles.css.map'));
  });

  it('returns empty array when no .map files exist', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'app.js'), 'console.log("hi")');
    const results = findSourceMaps(dir);
    assert.deepEqual(results, [], 'expected empty array when no .map files present');
  });

  it('finds .map files in nested directories', () => {
    const dir = makeTempDir();
    const assetsDir = join(dir, 'assets');
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, 'chunk.js.map'), '{}');
    const results = findSourceMaps(dir);
    assert.equal(results.length, 1, 'expected findSourceMaps to find nested .map files');
    assert.ok(results[0].includes('chunk.js.map'));
  });

  it('does not include files that are not .map extensions', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'sourcemap-config.json'), '{}');
    writeFileSync(join(dir, 'app.js'), 'code');
    const results = findSourceMaps(dir);
    assert.deepEqual(results, [], 'expected non-.map files to be excluded');
  });
});
