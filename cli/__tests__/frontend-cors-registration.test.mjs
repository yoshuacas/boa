import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { registerOrigin } from '../lib/frontend.mjs';

let tempDir;

function makeTempDir() {
  tempDir = mkdtempSync(join(tmpdir(), 'boa-cors-'));
  return tempDir;
}

function writeConfig(dir, config) {
  const boaDir = join(dir, '.boa');
  mkdirSync(boaDir, { recursive: true });
  writeFileSync(join(boaDir, 'config.json'), JSON.stringify(config, null, 2));
}

function readConfig(dir) {
  return JSON.parse(readFileSync(join(dir, '.boa', 'config.json'), 'utf8'));
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe('registerOrigin (CORS allow-list update)', () => {
  it('adds Amplify domain to empty allowedOrigins', () => {
    const dir = makeTempDir();
    writeConfig(dir, { projectName: 'test', allowedOrigins: [] });
    registerOrigin('https://main.abc123.amplifyapp.com', dir);
    const config = readConfig(dir);
    assert.deepEqual(
      config.allowedOrigins,
      ['https://main.abc123.amplifyapp.com'],
      'expected Amplify domain to be added to allowedOrigins'
    );
  });

  it('preserves existing origins when adding new one', () => {
    const dir = makeTempDir();
    writeConfig(dir, {
      projectName: 'test',
      allowedOrigins: ['https://existing.example.com'],
    });
    registerOrigin('https://main.abc123.amplifyapp.com', dir);
    const config = readConfig(dir);
    assert.ok(
      config.allowedOrigins.includes('https://existing.example.com'),
      'expected existing origin to be preserved'
    );
    assert.ok(
      config.allowedOrigins.includes('https://main.abc123.amplifyapp.com'),
      'expected new Amplify domain to be added'
    );
    assert.equal(config.allowedOrigins.length, 2);
  });

  it('deduplicates when domain already present', () => {
    const dir = makeTempDir();
    writeConfig(dir, {
      projectName: 'test',
      allowedOrigins: ['https://main.abc123.amplifyapp.com'],
    });
    registerOrigin('https://main.abc123.amplifyapp.com', dir);
    const config = readConfig(dir);
    assert.equal(
      config.allowedOrigins.length,
      1,
      'expected no duplicate when domain already in allowedOrigins'
    );
  });

  it('adds customDomain alongside Amplify domain', () => {
    const dir = makeTempDir();
    writeConfig(dir, { projectName: 'test', allowedOrigins: [] });
    registerOrigin('https://main.abc123.amplifyapp.com', dir);
    registerOrigin('https://app.example.dev', dir);
    const config = readConfig(dir);
    assert.ok(
      config.allowedOrigins.includes('https://main.abc123.amplifyapp.com'),
      'expected Amplify domain in origins'
    );
    assert.ok(
      config.allowedOrigins.includes('https://app.example.dev'),
      'expected custom domain in origins'
    );
  });

  it('persists config with correct JSON formatting (no comma-split regression)', () => {
    const dir = makeTempDir();
    writeConfig(dir, { projectName: 'test', allowedOrigins: [] });
    registerOrigin('https://main.abc123.amplifyapp.com', dir);
    const raw = readFileSync(join(dir, '.boa', 'config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed.allowedOrigins), 'expected allowedOrigins to be a valid JSON array');
    assert.equal(
      parsed.allowedOrigins[0],
      'https://main.abc123.amplifyapp.com',
      'expected origin to be stored as complete string without comma splitting'
    );
  });
});
