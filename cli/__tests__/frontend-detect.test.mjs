import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectFramework, buildFrontend } from '../lib/frontend.mjs';

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
  it('returns path ending in /dist for vite', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { devDependencies: { vite: '^5.0' } });
    const result = buildFrontend(dir, 'vite');
    assert.ok(result.endsWith('/dist'), 'expected vite build path to end in /dist');
  });

  it('returns path ending in /out for next', () => {
    const dir = makeTempDir();
    writePackageJson(dir, { dependencies: { next: '^14.0' } });
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
});
