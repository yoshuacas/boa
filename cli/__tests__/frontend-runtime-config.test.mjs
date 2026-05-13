import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeRuntimeConfig } from '../lib/frontend.mjs';

let tempDir;

function makeTempDir() {
  tempDir = mkdtempSync(join(tmpdir(), 'boa-runtime-config-'));
  return tempDir;
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe('writeRuntimeConfig', () => {
  describe('JSON shape', () => {
    it('writes config.json with all four fields when all present', () => {
      const dir = makeTempDir();
      const cfg = {
        apiUrl: 'https://api.example.dev',
        anonKey: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.fake',
        storageUrl: 'https://bucket.s3.us-east-1.amazonaws.com',
        authProvider: 'better-auth',
      };
      writeRuntimeConfig(dir, cfg);
      const written = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
      assert.equal(written.apiUrl, cfg.apiUrl, 'expected apiUrl in config.json');
      assert.equal(written.anonKey, cfg.anonKey, 'expected anonKey in config.json');
      assert.equal(written.storageUrl, cfg.storageUrl, 'expected storageUrl in config.json');
      assert.equal(written.authProvider, 'better-auth', 'expected authProvider in config.json');
      assert.equal(Object.keys(written).length, 4, 'expected exactly 4 fields');
    });

    it('omits storageUrl when not configured', () => {
      const dir = makeTempDir();
      const cfg = {
        apiUrl: 'https://api.example.dev',
        anonKey: 'test-anon-key',
        authProvider: 'better-auth',
      };
      writeRuntimeConfig(dir, cfg);
      const written = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
      assert.ok(!('storageUrl' in written), 'expected storageUrl to be omitted');
      assert.equal(Object.keys(written).length, 3, 'expected exactly 3 fields');
    });

    it('reflects cognito authProvider', () => {
      const dir = makeTempDir();
      const cfg = {
        apiUrl: 'https://api.example.dev',
        anonKey: 'test-anon-key',
        authProvider: 'cognito',
      };
      writeRuntimeConfig(dir, cfg);
      const written = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
      assert.equal(written.authProvider, 'cognito', 'expected authProvider to be cognito');
    });
  });

  describe('file location', () => {
    it('writes config.json to the distDir root', () => {
      const dir = makeTempDir();
      const cfg = {
        apiUrl: 'https://api.example.dev',
        anonKey: 'key',
        authProvider: 'better-auth',
      };
      writeRuntimeConfig(dir, cfg);
      const content = readFileSync(join(dir, 'config.json'), 'utf8');
      assert.ok(content, 'expected config.json to exist in distDir root');
    });
  });

  describe('cache-control metadata', () => {
    it('returns metadata with cacheControl header', () => {
      const dir = makeTempDir();
      const cfg = {
        apiUrl: 'https://api.example.dev',
        anonKey: 'key',
        authProvider: 'better-auth',
      };
      const metadata = writeRuntimeConfig(dir, cfg);
      assert.equal(
        metadata.cacheControl,
        'no-cache, must-revalidate',
        'expected cacheControl metadata for Amplify upload'
      );
    });
  });
});
