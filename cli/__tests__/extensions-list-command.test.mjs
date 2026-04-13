import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'bin', 'boa.mjs');

function run(args, opts = {}) {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], opts, (error, stdout, stderr) => {
      resolve({
        code: error ? error.code : 0,
        stdout,
        stderr,
      });
    });
  });
}

describe('boa extensions', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function makeTmpDir() {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-extensions-'));
    return tmpDir;
  }

  it('no config: stdout contains "Available extensions:" and exit code is 0', async () => {
    const dir = makeTmpDir();
    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes('Available extensions:'),
      `stdout should contain "Available extensions:", got: ${stdout}`
    );
  });

  it('no config: stdout contains api-gateway with its description', async () => {
    const dir = makeTmpDir();
    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes('api-gateway'),
      `stdout should contain "api-gateway", got: ${stdout}`
    );
  });

  it('no config: stdout does NOT contain "Enabled:" line', async () => {
    const dir = makeTmpDir();
    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      !stdout.includes('Enabled:'),
      `stdout should NOT contain "Enabled:" when no config exists, got: ${stdout}`
    );
  });

  it('empty extensions: stdout contains "Enabled: (none)"', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
        extensions: [],
      })
    );

    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes('Enabled: (none)'),
      `stdout should contain "Enabled: (none)", got: ${stdout}`
    );
  });

  it('api-gateway enabled: stdout contains [enabled] marker', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
        extensions: ['api-gateway'],
      })
    );

    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes('[enabled]'),
      `stdout should contain "[enabled]" marker, got: ${stdout}`
    );
  });

  it('api-gateway enabled: stdout contains "Enabled: api-gateway"', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
        extensions: ['api-gateway'],
      })
    );

    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes('Enabled: api-gateway'),
      `stdout should contain "Enabled: api-gateway", got: ${stdout}`
    );
  });
});
