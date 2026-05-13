import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectFramework, buildFrontend, _internal } from '../lib/frontend.mjs';

let tempDir;

function makeTempDir() {
  tempDir = mkdtempSync(join(tmpdir(), 'boa-detect-'));
  return tempDir;
}

function writePackageJson(dir, pkg) {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe('detectFramework', () => {
  it('detects vite from devDependencies', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { devDependencies: { vite: '^5.0' } });
    const result = detectFramework(dir);
    assert.equal(result, 'vite', 'expected detectFramework to return vite');
  });

  it('detects next from dependencies', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { dependencies: { next: '^14.0' } });
    const result = detectFramework(dir);
    assert.equal(result, 'next', 'expected detectFramework to return next');
  });

  it('detects cra from react-scripts dependency', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { dependencies: { 'react-scripts': '5' } });
    const result = detectFramework(dir);
    assert.equal(result, 'cra', 'expected detectFramework to return cra');
  });

  it('detects static when only index.html present', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    const result = detectFramework(dir);
    assert.equal(result, 'static', 'expected detectFramework to return static');
  });

  it('returns null for empty directory', () => {
    const dir = makeTempDir();
    const result = detectFramework(dir);
    assert.equal(result, null, 'expected detectFramework to return null for empty dir');
  });

  it('returns vite when both vite and next are present (first match wins)', () => {
    const dir = makeTempDir();
    writePackageJson(dir, {
      dependencies: { next: '^14.0' },
      devDependencies: { vite: '^5.0' },
    });
    const result = detectFramework(dir);
    assert.equal(result, 'vite', 'expected vite to win when both vite and next are present');
  });
});

describe('buildFrontend', () => {
  let originalExec;

  beforeEach(() => {
    originalExec = _internal.exec;
    _internal.exec = () => '';
  });

  afterEach(() => {
    _internal.exec = originalExec;
  });

  it('returns path ending in /dist for vite', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { devDependencies: { vite: '^5.0' } });
    const result = buildFrontend(dir, 'vite');
    assert.ok(result.endsWith('/dist'), 'expected vite build path to end in /dist');
  });

  it('returns path ending in /out for next with output export config', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { dependencies: { next: '^15.0.0' } });
    writeFileSync(join(dir, 'next.config.js'), "module.exports = { output: 'export' }");
    const result = buildFrontend(dir, 'next');
    assert.ok(result.endsWith('/out'), 'expected next build path to end in /out');
  });

  it('returns path ending in /build for cra', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { dependencies: { 'react-scripts': '5' } });
    const result = buildFrontend(dir, 'cra');
    assert.ok(result.endsWith('/build'), 'expected cra build path to end in /build');
  });

  it('returns input path for static (no build)', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    const result = buildFrontend(dir, 'static');
    assert.equal(result, dir, 'expected static to return input path unchanged');
  });

  it('next build with output export calls next build but not next export', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { dependencies: { next: '^15.0.0' } });
    writeFileSync(join(dir, 'next.config.js'), "module.exports = { output: 'export' }");
    const calls = [];
    _internal.exec = (cmd, opts) => { calls.push(cmd); return ''; };
    mkdirSync(join(dir, 'out'), { recursive: true });
    const result = buildFrontend(dir, 'next');
    assert.ok(result.endsWith('/out'), 'expected path to end in /out');
    assert.ok(calls.some(c => c.includes('next build')), 'expected next build to be called');
    assert.ok(!calls.some(c => c.includes('next export')), 'expected next export NOT to be called');
  });

  it('next build without output export throws a clear error', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { dependencies: { next: '^15.0.0' } });
    writeFileSync(join(dir, 'next.config.js'), "module.exports = { reactStrictMode: true }");
    assert.throws(
      () => buildFrontend(dir, 'next'),
      (err) => {
        assert.ok(err.message.includes("static export"), 'error should mention static export');
        assert.ok(err.message.includes("output: 'export'"), 'error should mention the config fix');
        return true;
      }
    );
  });

  it('detects output export in next.config.mjs', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { dependencies: { next: '^15.0.0' } });
    writeFileSync(join(dir, 'next.config.mjs'), 'export default { output: "export" }');
    const result = buildFrontend(dir, 'next');
    assert.ok(result.endsWith('/out'), 'expected .mjs config to be detected');
  });

  it('detects output export in next.config.ts', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { dependencies: { next: '^15.0.0' } });
    writeFileSync(join(dir, 'next.config.ts'), "const config = { output: 'export' };\nexport default config;");
    const result = buildFrontend(dir, 'next');
    assert.ok(result.endsWith('/out'), 'expected .ts config to be detected');
  });
});
